#!/usr/bin/env node
/**
 * 전체 재생성기(self-heal) — 데이터/템플릿이 바뀌어도 사이트 전체를 한 번에 최신화.
 *  - data/articles/*.json → articles/*.html
 *  - 홈(index.html, page1) + page/N.html  (12개씩 정적 페이지네이션)
 *  - 국가 카테고리:  country/{region}.html (+ /page/N)
 *  - 시즌 카테고리:  season/{key}.html   (+ /page/N)
 *  - 칩(국가·시즌) + 즉석필터용 articles.json + sitemap.xml
 * 전부 한 번의 빌드로 생성 → Cloudflare 빌드 추가 소모 없음.
 */
const fs = require('fs');
const path = require('path');
const { buildOne } = require('./build');
const titles = require('./lib/titles');
const cat = require('./lib/categories');

const ROOT = __dirname;
const SITE = 'https://howcartful.com';
const PAGE_SIZE = 12;
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = () => new Date().toISOString().slice(0, 10);
const imgUrl = u => u ? ('https:' + String(u).replace(/^https?:/, '')) : '';

// ── 썸네일(호스트별 축소) ──
const smallImg = u => {
  if (/bstatic\.com/.test(u)) return u.replace(/\/max\d+(x\d+)?\//, '/max300/').replace(/\/square\d+\//, '/square180/');
  if (/pix\d*\.agoda\.net/.test(u)) return u + (u.includes('?') ? '&' : '?') + 's=360x240';
  return u;
};
const thumbHtml = thumbs => {
  if (!thumbs.length) return '';
  const imgs = thumbs.slice(0, 4).map(u => {
    const s = smallImg(u);
    const fb = s !== u ? ` onerror="this.onerror=null;this.src='${u}'"` : '';
    return `<img src="${s}"${fb} alt="" loading="lazy" decoding="async">`;
  }).join('');
  return `<div class="cpanel"><div class="cwin"><span class="bar"><i></i><i></i><i></i></span><div class="cgrid">${imgs}</div></div></div>`;
};
function cardHtml(m) {
  return `<a class="card" href="/articles/${m.slug}">\n        ${thumbHtml(m.thumbs)}\n        <div class="cbody"><h2>${esc(m.title)}</h2><p>${esc(m.desc)}</p></div>\n        <span class="cbtn">리뷰 보러가기 →</span>\n      </a>`;
}

// ── 페이지네이션 ──
function chunk(arr, n) { const o = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o.length ? o : [[]]; }
function pagerHtml(cur, total, urlFn) {
  if (total <= 1) return '';
  const want = new Set([1, total, cur, cur - 1, cur + 1, cur - 2, cur + 2]);
  const ks = []; for (let k = 1; k <= total; k++) if (want.has(k)) ks.push(k);
  let html = '', last = 0;
  if (cur > 1) html += `<a class="pg nav" href="${urlFn(cur - 1)}" aria-label="이전">‹</a>`;
  ks.forEach(k => {
    if (last && k - last > 1) html += `<span class="pg gap">…</span>`;
    html += (k === cur) ? `<span class="pg cur" aria-current="page">${k}</span>` : `<a class="pg" href="${urlFn(k)}">${k}</a>`;
    last = k;
  });
  if (cur < total) html += `<a class="pg nav" href="${urlFn(cur + 1)}" aria-label="다음">›</a>`;
  return html;
}

// ── 칩(국가·시즌) ──
function chipsHtml(counts, activeType, activeKey) {
  const cur = cat.currentSeason();
  const seasonChips = cat.SEASON_ORDER.filter(k => counts.seasons[k])
    .map(k => {
      const on = activeType === 'season' && activeKey === k ? ' on' : '';
      const now = k === cur ? '<span class="now">지금</span>' : '';
      return `<a class="chip${on}" href="/season/${k}">${cat.SEASON_EMOJI[k]} ${cat.SEASON_LABEL[k]}${now}</a>`;
    }).join('');
  const countryChips = Object.entries(counts.countries)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, v]) => {
      const on = activeType === 'country' && activeKey === key ? ' on' : '';
      return `<a class="chip${on}" href="/country/${key}">${esc(v.label)} <b>${v.count}</b></a>`;
    }).join('');
  const allOn = activeType === 'all' ? ' on' : '';
  return `<div class="chiprow"><span class="chlab">시즌</span><a class="chip${allOn}" href="/">전체</a>${seasonChips}</div>`
    + `<div class="chiprow"><span class="chlab">국가</span>${countryChips}</div>`;
}

// ── 페이지 렌더(마커 치환) ──
function renderPage(shell, o) {
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(o.title)}</title>`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${o.canon}">`)
    .replace(/<!--CATHEAD_START-->[\s\S]*?<!--CATHEAD_END-->/, `<!--CATHEAD_START-->${o.cathead}<!--CATHEAD_END-->`)
    .replace(/<!--CHIPS_START-->[\s\S]*?<!--CHIPS_END-->/, `<!--CHIPS_START-->${o.chips}<!--CHIPS_END-->`)
    .replace(/<!--ARTICLES_START-->[\s\S]*?<!--ARTICLES_END-->/, `<!--ARTICLES_START-->\n      ${o.cards}\n      <!--ARTICLES_END-->`)
    .replace(/<!--PAGER_START-->[\s\S]*?<!--PAGER_END-->/, `<!--PAGER_START-->${o.pager}<!--PAGER_END-->`);
}

// 한 카테고리(또는 홈)의 전체 페이지 생성
function renderPageSet(shell, metas, counts, opt) {
  // opt: { urlBase, fileBase, title(page), h1, desc, activeType, activeKey }
  const pages = chunk(metas, PAGE_SIZE);
  const total = pages.length;
  const urlFn = k => (k === 1 ? opt.urlBase : `${opt.urlBase === '/' ? '' : opt.urlBase}/page/${k}`) || '/';
  const chips = chipsHtml(counts, opt.activeType, opt.activeKey);
  pages.forEach((pm, i) => {
    const p = i + 1;
    const canon = SITE + urlFn(p);
    const cards = pm.length ? pm.map(cardHtml).join('\n      ')
      : '<div class="card"><div class="cbody"><h2>준비 중</h2><p>글이 곧 발행됩니다.</p></div></div>';
    const cathead = `<h1>${esc(opt.h1)}</h1><p>${esc(opt.desc)}</p>`;
    const html = renderPage(shell, {
      title: p === 1 ? opt.title : `${opt.title} · ${p}페이지`,
      canon, cathead, chips, cards, pager: pagerHtml(p, total, urlFn),
    });
    const file = opt.fileBase(p);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
  });
  return total;
}

function rebuildAll() {
  const q = readJSON(path.join(ROOT, 'data', 'queue.json'));
  const published = Array.isArray(q.publishedSlugs) ? q.publishedSlugs : [];

  // 1) 글 HTML 전체 재빌드
  const have = fs.readdirSync(path.join(ROOT, 'data', 'articles'))
    .filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
  have.forEach(buildOne);
  const haveSet = new Set(have);

  // 2) 발행 글 메타(최신글 위로) + 카테고리 태그
  const order = published.filter(s => haveSet.has(s)).reverse(); // 최신 발행이 위로
  const metas = order.map(slug => {
    const d = readJSON(path.join(ROOT, 'data', 'articles', slug + '.json'));
    const thumbs = (d.hotels || []).map(h => h.img).filter(Boolean).slice(0, 4).map(imgUrl);
    const region = cat.regionOf(d);
    return {
      slug, title: titles.makeTitle(d), desc: titles.makeCardDesc(d), thumbs,
      city: (cat.cityOf(d) || {}).name || d.cityName || '',
      regionKey: region ? region.key : '', regionLabel: region ? region.label : '',
      seasons: cat.seasonsOf(d),
    };
  });

  // 3) 카테고리 카운트
  const counts = { countries: {}, seasons: {} };
  metas.forEach(m => {
    if (m.regionKey) { (counts.countries[m.regionKey] = counts.countries[m.regionKey] || { label: m.regionLabel, count: 0 }).count++; }
    m.seasons.forEach(s => { counts.seasons[s] = (counts.seasons[s] || 0) + 1; });
  });

  const shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const urls = [];

  // 4) 홈(전체) 페이지셋
  const homePages = renderPageSet(shell, metas, counts, {
    urlBase: '/', fileBase: p => p === 1 ? path.join(ROOT, 'index.html') : path.join(ROOT, 'page', `${p}.html`),
    title: 'howcartful — AI 리뷰분석 가성비 호텔 추천·비교',
    h1: 'howcartful', desc: 'AI가 실제 리뷰 데이터를 분석해 가성비 호텔을 근거기반으로 비교·추천합니다.',
    activeType: 'all', activeKey: '',
  });
  urls.push({ loc: SITE + '/', pri: '1.0' });
  for (let p = 2; p <= homePages; p++) urls.push({ loc: `${SITE}/page/${p}`, pri: '0.6' });

  // 5) 국가 카테고리
  Object.entries(counts.countries).forEach(([key, v]) => {
    const sub = metas.filter(m => m.regionKey === key);
    const tp = renderPageSet(shell, sub, counts, {
      urlBase: `/country/${key}`,
      fileBase: p => p === 1 ? path.join(ROOT, 'country', `${key}.html`) : path.join(ROOT, 'country', key, 'page', `${p}.html`),
      title: `${v.label} 가성비 호텔 총정리 — howcartful`,
      h1: `${v.label} 가성비 호텔`, desc: `${v.label}의 도시별 가성비 호텔을 실제 아고다 리뷰로 비교·정리했습니다.`,
      activeType: 'country', activeKey: key,
    });
    urls.push({ loc: `${SITE}/country/${key}`, pri: '0.7' });
    for (let p = 2; p <= tp; p++) urls.push({ loc: `${SITE}/country/${key}/page/${p}`, pri: '0.5' });
  });

  // 6) 시즌 카테고리
  cat.SEASON_ORDER.filter(k => counts.seasons[k]).forEach(key => {
    const sub = metas.filter(m => m.seasons.includes(key));
    const lab = cat.SEASON_LABEL[key];
    const tp = renderPageSet(shell, sub, counts, {
      urlBase: `/season/${key}`,
      fileBase: p => p === 1 ? path.join(ROOT, 'season', `${key}.html`) : path.join(ROOT, 'season', key, 'page', `${p}.html`),
      title: `${lab} 여행 가성비 호텔 — howcartful`,
      h1: `${cat.SEASON_EMOJI[key]} ${lab} 여행 가성비 호텔`, desc: `${lab}에 어울리는 여행지의 가성비 호텔을 실제 리뷰로 비교했습니다.`,
      activeType: 'season', activeKey: key,
    });
    urls.push({ loc: `${SITE}/season/${key}`, pri: '0.7' });
    for (let p = 2; p <= tp; p++) urls.push({ loc: `${SITE}/season/${key}/page/${p}`, pri: '0.5' });
  });

  // 7) 검색 인덱스(즉석필터·검색용)
  fs.writeFileSync(path.join(ROOT, 'articles.json'), JSON.stringify(metas.map(m => ({
    slug: m.slug, title: m.title, city: m.city, country: m.regionLabel,
    region: m.regionKey, seasons: m.seasons, img: (m.thumbs[0] ? smallImg(m.thumbs[0]) : ''),
  }))));

  // 8) 사이트맵
  metas.forEach(m => urls.push({ loc: `${SITE}/articles/${m.slug}`, pri: '0.8' }));
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u.loc}</loc><lastmod>${today()}</lastmod><priority>${u.pri}</priority></url>`).join('\n') +
    `\n</urlset>\n`);

  console.log(`✓ 재생성: 글 ${have.length} · 홈 ${homePages}p · 국가 ${Object.keys(counts.countries).length} · 시즌 ${Object.keys(counts.seasons).length} · URL ${urls.length}`);
  return { built: have.length, cards: metas.length };
}

if (require.main === module) rebuildAll();
module.exports = { rebuildAll };
