#!/usr/bin/env node
/**
 * howcartful 정적 글 생성기
 *  data/articles/<slug>.json + templates/article.template.html → articles/<slug>.html
 *  - 어필리에이트 링크는 lib/agoda.js로 cid 자동 구성
 *  - 파생값(가성비%, 정렬, 배지)은 여기서 계산 → 데이터는 사실만 담음
 *
 * 사용법:
 *   node build.js                 # data/articles/*.json 전부 생성
 *   node build.js osaka-namba     # 특정 슬러그만 생성
 */
const fs = require('fs');
const path = require('path');
const agoda = require('./lib/agoda');
const titles = require('./lib/titles');

const ROOT = __dirname;
const TPL = fs.readFileSync(path.join(ROOT, 'templates', 'article.template.html'), 'utf8');

// ── 무의존성 Mustache(부분집합) 렌더러 ───────────────────────────
// 지원: {{var}}(이스케이프) · {{{var}}}(원문) · {{#sec}}..{{/sec}} · {{.}}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function lookup(stack, key) {
  if (key === '.') return stack[stack.length - 1];
  for (let i = stack.length - 1; i >= 0; i--) {
    const c = stack[i];
    if (c && typeof c === 'object' && key in c) return c[key];
  }
  return undefined;
}
function findClose(tpl, from, name) {
  const re = new RegExp('\\{\\{([#/])\\s*' + name.replace(/\./g, '\\.') + '\\s*\\}\\}', 'g');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(tpl))) {
    if (m[1] === '#') depth++;
    else if (--depth === 0) return { start: m.index, end: re.lastIndex };
  }
  throw new Error('unclosed section: ' + name);
}
function render(tpl, stack) {
  const re = /\{\{([#\/]?)(\{?)\s*([\w.]+)\s*\}?\}\}/g;
  let out = '', last = 0, m;
  while ((m = re.exec(tpl))) {
    out += tpl.slice(last, m.index);
    const sigil = m[1], triple = m[2] === '{', name = m[3];
    if (sigil === '#') {
      const close = findClose(tpl, re.lastIndex, name);
      const inner = tpl.slice(re.lastIndex, close.start);
      const val = lookup(stack, name);
      if (Array.isArray(val)) val.forEach(item => out += render(inner, stack.concat([item])));
      else if (val) out += render(inner, stack.concat([typeof val === 'object' ? val : {}]));
      re.lastIndex = close.end; last = close.end; continue;
    }
    const val = lookup(stack, name);
    const s = val == null ? '' : String(val);
    out += triple ? s : escapeHtml(s);
    last = re.lastIndex;
  }
  return out + tpl.slice(last);
}

// ── 데이터 → 렌더 컨텍스트(파생값 계산) ──────────────────────────
function buildContext(data) {
  const lang = data.lang || agoda.DEFAULT_LANG;
  const hotels = data.hotels.map(h => ({
    ...h,
    reviewCountFmt: Number(h.reviewCount).toLocaleString('en-US'),
    valueIndex: h.valueIndex.toFixed(1),
    valuePct: Math.round(h.valueIndex * 10),
    rankClass: h.rank === 1 ? 'top' : '',
    rankBadge: (h.rank === 1 ? '🏆 ' : '') + h.rank + '위 · 가성비 ' + h.valueIndex.toFixed(1),
    refShort: data.refShort,
    agodaUrl: h.agodaUrl || agoda.hotelLink(h.hotelSlug, data.citySlug, lang),
    hasReviews: Array.isArray(h.reviews) && h.reviews.length > 0,
  }));
  return {
    ...data,
    hotels,
    hotelsByValue: [...hotels].sort((a, b) => b.valuePct - a.valuePct),
    hotelsByDistance: [...hotels].sort((a, b) => a.walkMin - b.walkMin),
    hotelCards: hotels, // 1위~전체 호텔 카드(사진+예약+리뷰)
    cityUrl: agoda.cityLink(data.citySlug, lang),
    // 제목·메타는 빌드 시점에 풀 조합으로 생성(슬러그 고정)
    title: titles.makeTitle(data),
    heroTitleHtml: titles.makeHeroHtml(data),
    metaDescription: titles.makeMeta(data),
  };
}

function buildOne(slug) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'articles', slug + '.json'), 'utf8'));
  const html = render(TPL, [buildContext(data)]);
  const outDir = path.join(ROOT, 'articles');
  fs.writeFileSync(path.join(outDir, slug + '.html'), html);
  console.log('✓ built articles/' + slug + '.html  (' + data.hotels.length + ' hotels, cid=' + agoda.CID + ')');
}

// ── 실행(CLI일 때만) ────────────────────────────────────────────
if (require.main === module) {
  const arg = process.argv[2];
  if (arg) {
    buildOne(arg);
  } else {
    const dir = path.join(ROOT, 'data', 'articles');
    fs.readdirSync(dir).filter(f => f.endsWith('.json')).forEach(f => buildOne(f.replace(/\.json$/, '')));
  }
}

module.exports = { buildOne, buildContext, render };
