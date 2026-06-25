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
const N = Number(nArg) || 7;   // 비교 호텔 수 기본 7(홀수) — 5도 가능
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
    reviewKeywordsHtml: `평점 <b>${h.score}</b> · 실제 투숙객 리뷰 ${Number(h.reviewCount).toLocaleString('en-US')}건 기반.`,
    reviews: (h.reviews || []).map(r => ({
      text: r.text,
      translated: !!r.translated,
      meta: [r.country, r.rating != null ? '★' + r.rating : '', r.date].filter(Boolean).join(' · '),
    })),
    ctaText: '🏨 최저가·예약창 가격 확인',
  };
}

(async () => {
  console.log(`▶ 아고다 수집: cityId=${cityId}, top ${N} (cid=${af.CID || ''})`);
  const cs = await af.fetchCitySearch(Number(cityId));
  const rawCityName = cs?.searchResult?.searchInfo?.objectInfo?.cityName || '';
  const cityName = rawCityName.split('/')[0].trim() || rawCityName; // "도쿄 / 동경" → "도쿄"
  const props = (cs.properties || []).map(p => af.mapProperty(p));

  const picked = props
    .filter(h => h.name && h.score != null && h.agodaUrl && h.reviewCount >= MIN_REVIEWS)
    .sort((a, b) => (b.valueIndex || 0) - (a.valueIndex || 0))
    .slice(0, N)
    .map((h, i) => ({ ...h, rank: i + 1 }));

  if (!picked.length) throw new Error('조건을 만족하는 호텔이 없습니다 (리뷰수/가격/평점 확인).');

  // 비한국어 리뷰 → 한국어 번역(무료 구글, 실패 시 원문 유지)
  let trCount = 0;
  for (const h of picked) {
    for (const r of (h.reviews || [])) {
      if (/[가-힣]/.test(r.text)) continue;          // 이미 한국어
      const ko = await af.translateToKo(r.text);
      if (ko && /[가-힣]/.test(ko)) { r.original = r.text; r.text = ko; r.translated = true; trCount++; }
      await new Promise(res => setTimeout(res, 120)); // 무료 엔드포인트 배려
    }
  }
  if (trCount) console.log(`  ↳ 리뷰 ${trCount}건 한국어 번역`);

  const citySlug = citySlugFrom(picked[0].propertyUrl) || '';
  const count = picked.length;
  // cityId 검색은 도시 전역 결과 → 각 호텔의 "최단 역" 기준으로 표기
  const refName = '각 호텔 최단 역';
  const refShort = '최단 역';
  const hotels = picked.map(h => defaults(h, refName));

  // 본문(제목·결론 등)은 실데이터에서 매번 재생성 — 옛 값 보존하지 않음(불일치 방지)
  const shortName = s => String(s).split('(')[0].trim();
  const top = picked[0];
  const closest = [...picked].sort((a, b) => (a.walkMin || 99) - (b.walkMin || 99))[0];
  const topPrice = (top.priceText.split('·')[1] || '').trim();
  const verdictHtml = `가성비 1위는 <b>${shortName(top.name)}</b>(평점 ${top.score}·리뷰 ${Number(top.reviewCount).toLocaleString('en-US')}건${topPrice ? '·1박 ' + topPrice : ''})로 가격 대비 만족도가 가장 높습니다. 역 접근성을 우선한다면 <b>${(closest.refLandmark || '주요 역')} 도보 ${closest.walkMin}분</b>의 <b>${shortName(closest.name)}</b>를 추천합니다.`;

  const outPath = path.join(ROOT, 'data', 'articles', slug + '.json');
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};
  const heroImg = picked[0].img ? ('https:' + picked[0].img.replace(/^https?:/, '')) : '';
  const data = {
    slug,
    title: `${cityName} 가성비 호텔 ${count}곳 비교 — 실제 리뷰·역세권 기준`,
    metaDescription: `AI가 실제 아고다 리뷰 데이터를 분석해 ${cityName} 가성비 호텔 ${count}곳을 거리·평점·가격·가성비지수로 비교했습니다.`,
    lang: prev.lang || 'ko-kr',
    citySlug: prev.citySlug || citySlug,
    cityName: prev.cityName || cityName,
    cityId: Number(cityId),
    refName, refShort,
    areaName: cityName,
    heroImg: prev.heroImg || heroImg,
    heroAlt: prev.heroAlt || cityName,
    heroTitleHtml: `${cityName} 가성비 호텔 ${count}곳<br>실제 리뷰·역세권 비교`,
    heroSub: prev.heroSub || '실제 아고다 리뷰 데이터를 분석해 거리·평점·가격·가성비를 한눈에',
    verdictHtml,
    outroImg: prev.outroImg || heroImg,
    outroTitle: `🌙 ${cityName}, 어디에 묵어도 후회없이`,
    outroText: `위 ${count}곳은 모두 ${cityName} 역세권의 검증된 가성비 숙소입니다. 날짜가 정해졌다면 아고다에서 ${cityName} 전체 숙소를 한 번에 비교해보세요.`,
    seasons: prev.seasons || [],
    hotels,
    _meta: { fetchedAt: new Date().toISOString(), source: 'agoda citySearch', count },
  };

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`✓ data/articles/${slug}.json 생성 (${hotels.length}개 호텔, 기준점="${refName}", city="${cityName}")`);
  console.log('  다음: node build.js ' + slug);
  if (!data.seasons.length) console.log('  ※ seasons/verdict 등 편집 필드는 비어있음 — 보강 후 발행 권장.');
})().catch(e => { console.error('✗ ' + e.message); process.exit(1); });
