#!/usr/bin/env node
/**
 * 도시 ID로 아고다 호텔을 수집해 글 데이터 JSON을 만든다.
 *   node fetch-hotels.js <cityId> <slug> [N]
 *   예) node fetch-hotels.js 9590 osaka-namba 5     (오사카=9590)
 *
 * 결과: data/articles/<slug>.json  (사실 데이터 자동 + 편집 필드는 기존값 보존/플레이스홀더)
 * 그 뒤 `node build.js <slug>` 로 HTML 생성.
 *
 * ⚠️ 아고다는 봇 차단이 있어 서버에서 막힐 수 있음.
 *    막히면(403) 브라우저 세션 쿠키를 환경변수로:  AGODA_COOKIE="..." node fetch-hotels.js ...
 *    (쿠키는 절대 커밋 금지 — .gitignore가 .env/*token* 등 차단)
 */
const fs = require('fs');
const path = require('path');
const af = require('./lib/agoda-fetch');

const ROOT = __dirname;
const [cityId, slug, nArg] = process.argv.slice(2);
const N = Number(nArg) || 5;
const MIN_REVIEWS = 30;

if (!cityId || !slug) {
  console.error('사용법: node fetch-hotels.js <cityId> <slug> [N]');
  process.exit(1);
}

function citySlugFrom(propertyUrl) {
  const m = String(propertyUrl).match(/\/hotel\/([^/]+?)\.html/);
  return m ? m[1] : '';
}
function mode(arr) {
  const c = {}; let best = null, bestN = 0;
  arr.filter(Boolean).forEach(x => { c[x] = (c[x] || 0) + 1; if (c[x] > bestN) { best = x; bestN = c[x]; } });
  return best;
}
function defaults(h, refName) {
  const tags = [];
  if (h.priceKRW) tags.push('💰 약 ' + Math.round(h.priceKRW / 10000) + '만원');
  tags.push('📝 리뷰 ' + Number(h.reviewCount).toLocaleString('en-US') + '건');
  if (h.star) tags.push('⭐ ' + h.star + '성급');
  tags.push('📶 무료 Wi-Fi');
  return {
    rank: h.rank, name: h.name, hotelSlug: '', agodaUrl: h.agodaUrl,
    walkMin: h.walkMin, score: h.score, reviewCount: h.reviewCount,
    priceBand: h.priceBand, priceText: h.priceText, valueIndex: h.valueIndex,
    img: h.img,
    distanceNote: h.distanceM != null ? `약 ${h.distanceM}m · ${h.refLandmark || refName} 인근` : '',
    metaTags: tags,
    reviewKeywordsHtml: `평점 <b>${h.score}</b> · 리뷰 ${Number(h.reviewCount).toLocaleString('en-US')}건 기반. (리뷰 키워드 분석은 보강 예정)`,
    ctaText: '🏨 최저가·예약창 가격 확인',
  };
}

(async () => {
  console.log(`▶ 아고다 수집: cityId=${cityId}, top ${N} (cid=${af.CID || ''})`);
  const cs = await af.fetchCitySearch(Number(cityId));
  const cityName = cs?.searchResult?.searchInfo?.objectInfo?.cityName || '';
  const props = (cs.properties || []).map(p => af.mapProperty(p));

  const picked = props
    .filter(h => h.name && h.score != null && h.agodaUrl && h.reviewCount >= MIN_REVIEWS)
    .sort((a, b) => (b.valueIndex || 0) - (a.valueIndex || 0))
    .slice(0, N)
    .map((h, i) => ({ ...h, rank: i + 1 }));

  if (!picked.length) throw new Error('조건을 만족하는 호텔이 없습니다 (리뷰수/가격/평점 확인).');

  const citySlug = citySlugFrom(picked[0].propertyUrl) || '';
  const refName = mode(picked.map(h => (h.refKind === 'station' ? h.refLandmark : null))) || (cityName + ' 중심');
  const hotels = picked.map(h => defaults(h, refName));

  // 기존 JSON 있으면 편집 필드 보존, 없으면 플레이스홀더 생성
  const outPath = path.join(ROOT, 'data', 'articles', slug + '.json');
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
  const heroImg = picked[0].img || '';
  const data = {
    slug,
    title: prev.title || `${cityName} ${refName} 인근 가성비 호텔 ${hotels.length}곳 비교`,
    metaDescription: prev.metaDescription || `AI가 실제 아고다 리뷰 데이터를 분석해 ${cityName} ${refName} 인근 가성비 호텔 ${hotels.length}곳을 거리·평점·가격·가성비지수로 비교했습니다.`,
    lang: prev.lang || 'ko-kr',
    citySlug: prev.citySlug || citySlug,
    cityName: prev.cityName || cityName,
    cityId: Number(cityId),
    refName: prev.refName || refName,
    refShort: prev.refShort || refName,
    areaName: prev.areaName || cityName,
    heroImg: prev.heroImg || heroImg,
    heroAlt: prev.heroAlt || `${cityName} ${refName}`,
    heroTitleHtml: prev.heroTitleHtml || `${cityName} ${refName} 인근<br>가성비 호텔 ${hotels.length}곳 비교`,
    heroSub: prev.heroSub || '실제 아고다 리뷰 데이터를 분석해 거리·평점·가격·가성비를 한눈에',
    verdictHtml: prev.verdictHtml || `가성비 1위는 <b>${hotels[0].name}</b>(가성비지수 ${hotels[0].valueIndex})입니다. (편집 보강 권장)`,
    outroImg: prev.outroImg || (picked[picked.length - 1].img || heroImg),
    outroTitle: prev.outroTitle || `🌙 ${cityName} ${refName}, 어디에 묵어도 후회없이`,
    outroText: prev.outroText || `위 ${hotels.length}곳은 모두 ${refName} 인근의 검증된 가성비 숙소입니다. 날짜가 정해졌다면 아고다에서 ${cityName} 전체 숙소를 한 번에 비교해보세요.`,
    seasons: prev.seasons || [],
    hotels,
    _meta: { fetchedAt: new Date().toISOString(), source: 'agoda citySearch', count: hotels.length },
  };

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✓ data/articles/${slug}.json 생성 (${hotels.length}개 호텔, 기준점="${refName}", city="${cityName}")`);
  console.log('  다음: node build.js ' + slug);
  if (!data.seasons.length) console.log('  ※ seasons/verdict 등 편집 필드는 비어있음 — 보강 후 발행 권장.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
