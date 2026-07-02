/**
 * howcartful 제목·설명 생성기 (하드코딩 풀 × 조합, 슬러그로 고정 선택)
 *  - 빌드 시점 생성 → 기존 글도 재빌드만으로 새 제목 반영, 매 빌드 동일(슬러그 고정)
 *  - 모든 수식어는 사실 기반(가성비/리뷰/평점/역세권 등)만 사용
 */
const fs = require('fs');
const path = require('path');

const { loadCities } = require('./cities');
const CITIES = loadCities();
const byId = {}; CITIES.forEach(c => { byId[c.cityId] = c; });

const ADJ = ['가성비 좋은', '리뷰 좋은', '가심비 좋은', '역세권', '평점 높은', '후기 좋은',
  '만족도 높은', '재방문 많은', '위치 좋은', '깔끔한', '실속형', '코스파 좋은', '가격 착한', '손꼽히는'];
const NOUN = ['호텔', '숙소'];
const HOOK = ['역세권만 골랐다', '실제 후기로 검증', '가격 대비 만족도 1위는?', '한눈에 비교',
  '솔직 비교', '데이터로 비교', '총정리', '후회 없는 선택', '떠나기 전 필독', 'BEST'];

function hash(s) { let h = 2166136261; for (let i = 0; i < String(s).length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const pick = (arr, seed) => arr[seed % arr.length];
const shortName = s => String(s || '').split('(')[0].trim();

function cityInfo(article) {
  const c = byId[article.cityId];
  const city = (c && c.name) || String(article.cityName || article.areaName || '').split('/')[0].trim();
  let country = (c && c.country) || '';
  if (country && country === city) country = ''; // 도시국가(싱가포르·홍콩) 중복 방지
  return { city, country };
}
function priceOf(article) {
  const t = article.hotels && article.hotels[0] && article.hotels[0].priceText || '';
  const m = t.split('·')[1]; return m ? m.trim() : '';
}

// 메인 제목: [국가 도시] 수식어 명사 N개 후크
function makeTitle(article) {
  const { city, country } = cityInfo(article);
  const n = (article.hotels && article.hotels.length) || 7;
  const h = hash(article.slug);
  const adj = pick(ADJ, h);
  const noun = pick(NOUN, h >>> 3);
  let hook = pick(HOOK, h >>> 7);
  if (adj === '역세권' && hook === '역세권만 골랐다') hook = pick(HOOK, (h >>> 7) + 1); // 중복 표현 회피
  const prefix = country ? `[${country} ${city}]` : `[${city}]`;
  const tail = hook === 'BEST' ? `BEST ${n}` : `${n}개 — ${hook}`;
  return `${prefix} ${adj} ${noun} ${tail}`;
}

// 히어로 H1: 1줄 [국가 도시] / 2줄 나머지
function makeHeroHtml(article) {
  const t = makeTitle(article);
  const i = t.indexOf(']');
  if (i < 0) return esc(t);
  return `${esc(t.slice(0, i + 1))}<br>${esc(t.slice(i + 1).trim())}`;
}

// 메타설명(검색결과 노출): 도시+국가+근거 요약, "곳" 미사용
function makeMeta(article) {
  const { city, country } = cityInfo(article);
  const n = (article.hotels && article.hotels.length) || 7;
  const top = article.hotels && article.hotels[0];
  const where = country ? `${country} ${city}` : city;
  const price = priceOf(article);
  const lead = top ? `${shortName(top.name)}(평점 ${top.score}${price ? `·1박 ${price}` : ''}) 등 ` : '';
  return `${where} ${n}개 ${lead}— 실제 아고다 리뷰로 평점·가격·가성비·역세권을 비교해 정리했습니다.`;
}

// 첫화면 카드 설명(글마다 다르게, 실데이터)
const DESC = [
  a => `평점 ${a.top.score}·도보 ${a.top.walkMin}분, ${a.price ? '1박 ' + a.price + ' ' : ''}— ${a.city} 가성비 1위는?`,
  a => `후기 좋은 곳만 추렸어요 — ${shortName(a.top.name)} 외 ${a.n - 1}개`,
  a => `${a.city}, 평점 ${a.top.score}에 ${a.price || '합리적 가격'}. 역세권만 비교했습니다.`,
  a => `도보 ${a.top.walkMin}분 + 가성비 순. ${a.city} ${a.n}개 한눈에 비교.`,
  a => `${shortName(a.top.name)}${a.price ? ', 1박 ' + a.price : ''}. ${a.city} 가성비 ${a.n}개 비교.`,
  a => `실제 투숙객 리뷰로 검증한 ${a.city} ${a.n}개. 가격 대비 만족도 1위가 궁금하다면.`,
];
function makeCardDesc(article) {
  const { city } = cityInfo(article);
  const top = article.hotels && article.hotels[0];
  if (!top) return `${city} 가성비 숙소 비교.`;
  const ctx = { city, n: (article.hotels.length) || 7, top, price: priceOf(article) };
  return pick(DESC, hash(article.slug) >>> 11)(ctx);
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

module.exports = { makeTitle, makeHeroHtml, makeMeta, makeCardDesc, cityInfo };
