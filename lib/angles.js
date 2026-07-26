/**
 * 앵글 엔진 — 한 도시의 "호텔 풀"에서 관점(앵글)마다 다른 top7을 뽑아 별도 글을 파생.
 *  - 추가 아고다 수집 없음(이미 저장된 풀 재활용)
 *  - 앵글마다 정렬/필터가 달라 실제로 다른 호텔 셋 → 데이터 기반 유지, 중복 회피
 *  - 기존 도시 글(가성비 기본)은 그대로 두고 -{angle} 슬러그로 추가 → URL·색인 안전
 */
const MIN_REVIEWS = 30;
const MIN_PER_ANGLE = 5;

// 앵글 정의. rank는 오름차순 정렬 키(작을수록 위). filter로 후보 축소.
const ANGLES = [
  { id: 'rating',   label: '평점 높은', adj: '평점 높은',   rank: h => -(h.score || 0) },
  { id: 'station',  label: '역세권',    adj: '역세권',       rank: h => (h.walkMin == null ? 999 : h.walkMin) },
  { id: 'budget',   label: '저가 실속', adj: '가격 착한',   filter: h => (h.priceBand || 3) <= 2, rank: h => (h.priceKRW || 9e9) },
  { id: 'premium',  label: '프리미엄',  adj: '고급',         filter: h => (h.priceBand || 3) >= 4 || (h.star || 0) >= 5, rank: h => -(h.score || 0) },
  { id: 'star4',    label: '4성급',     adj: '4성급',        filter: h => (h.star || 0) === 4, rank: h => -(h.valueIndex || 0) },
  { id: 'reviewed', label: '리뷰 많은', adj: '후기 많은',   rank: h => -(h.reviewCount || 0) },
];

function eligible(pool) {
  return (pool || []).filter(h => h && h.name && h.score != null && h.agodaUrl && (h.reviewCount || 0) >= MIN_REVIEWS);
}

// 앵글별 상위 7개(원시 mapProperty 객체)
function sliceAngle(pool, angle, n = 7) {
  let list = eligible(pool);
  if (angle.filter) list = list.filter(angle.filter);
  list = list.slice().sort((a, b) => angle.rank(a) - angle.rank(b));
  return list.slice(0, n);
}

// mapProperty 원시객체 → 글 hotels[] 항목(fetch-hotels defaults와 동일 형태)
function toHotel(h, rank, refName) {
  const tags = [];
  if (h.priceKRW) tags.push('💰 약 ' + Math.round(h.priceKRW / 10000) + '만원');
  tags.push('📝 리뷰 ' + Number(h.reviewCount).toLocaleString('en-US') + '건');
  if (h.star) tags.push('⭐ ' + h.star + '성급');
  tags.push('📶 무료 Wi-Fi');
  return {
    rank, name: h.name, hotelSlug: '', agodaUrl: h.agodaUrl,
    walkMin: h.walkMin, score: h.score, reviewCount: h.reviewCount,
    priceBand: h.priceBand, priceText: h.priceText, valueIndex: h.valueIndex,
    img: h.img,
    distanceNote: h.distanceM != null ? `약 ${h.distanceM}m · ${h.refLandmark || refName} 인근` : '',
    metaTags: tags,
    reviewKeywordsHtml: `평점 <b>${h.score}</b> · 실제 투숙객 리뷰 ${Number(h.reviewCount).toLocaleString('en-US')}건 기반.`,
    reviews: (h.reviews || []).map(r => ({
      text: r.text, score: r.rating != null ? String(r.rating) : '★',
      country: r.country || '', date: r.date || '', translated: !!r.translated,
    })),
    ctaText: '🏨 최저가·예약창 가격 확인',
  };
}

const shortName = s => String(s || '').split('(')[0].trim();

// 도시 기본글(base) + 풀 → 앵글 글 데이터 배열
function angleArticles(base, pool) {
  const out = [];
  const citySlug = base.slug;                 // 도시 글 슬러그(예: tokyo)
  const refName = base.refName || '각 호텔 최단 역';
  const cityName = base.cityName || base.areaName || citySlug;
  for (const angle of ANGLES) {
    const picked = sliceAngle(pool, angle).map((h, i) => ({ ...h, rank: i + 1 }));
    if (picked.length < MIN_PER_ANGLE) continue;   // 후보 부족 앵글은 스킵
    const hotels = picked.map(h => toHotel(h, h.rank, refName));
    const top = picked[0];
    const topPrice = (String(top.priceText || '').split('·')[1] || '').trim();
    const heroImg = top.img ? ('https:' + String(top.img).replace(/^https?:/, '')) : (base.heroImg || '');
    out.push({
      slug: `${citySlug}-${angle.id}`,
      angle: angle.id, angleAdj: angle.adj,
      lang: base.lang || 'ko-kr',
      citySlug: base.citySlug || '', cityName, cityId: base.cityId,
      refName, refShort: base.refShort || '최단 역', areaName: cityName,
      heroImg, heroAlt: cityName,
      heroSub: `실제 아고다 리뷰로 ${cityName}의 ${angle.label} 숙소를 추렸습니다`,
      verdictHtml: `${angle.label} 기준 1순위는 <b>${shortName(top.name)}</b>입니다 (평점 ${top.score}·리뷰 ${Number(top.reviewCount).toLocaleString('en-US')}건${topPrice ? `·1박 ${topPrice}` : ''}). 같은 도시라도 관점을 바꾸면 최적의 숙소가 달라집니다.`,
      outroImg: heroImg,
      outroTitle: `🌙 ${cityName}, ${angle.label}으로 골라봤어요`,
      outroText: `날짜가 정해졌다면 아고다에서 ${cityName} 전체 숙소를 한 번에 비교해보세요.`,
      seasons: base.seasons || [],
      hotels,
      _meta: { source: 'angle-derived', angle: angle.id, base: citySlug, count: hotels.length, builtAt: new Date().toISOString() },
    });
  }
  return out;
}

module.exports = { ANGLES, sliceAngle, angleArticles, eligible };
