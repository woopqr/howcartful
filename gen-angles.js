#!/usr/bin/env node
/**
 * 앵글 글 파생기 — data/hotels/*.json(풀) + 도시 기본글 → data/articles/{도시}-{앵글}.json
 *  - 추가 아고다 수집 없음. 이미 저장된 풀에서 앵글별 top7을 잘라 별도 글 생성.
 *  - 이미 있는 슬러그는 스킵(재생성 안 함) → 안정적.
 *   node gen-angles.js [최대생성수]
 */
const fs = require('fs');
const path = require('path');
const { angleArticles } = require('./lib/angles');

const ROOT = __dirname;
const ART = path.join(ROOT, 'data', 'articles');
const POOLS = path.join(ROOT, 'data', 'hotels');

function genAngles({ limit = Infinity } = {}) {
  if (!fs.existsSync(POOLS)) return [];
  const made = [];
  for (const pf of fs.readdirSync(POOLS).filter(f => f.endsWith('.json'))) {
    const citySlug = pf.replace(/\.json$/, '');
    const basePath = path.join(ART, citySlug + '.json');
    if (!fs.existsSync(basePath)) continue;             // 도시 기본글이 있어야 파생
    let pool, base;
    try {
      pool = JSON.parse(fs.readFileSync(path.join(POOLS, pf), 'utf8'));
      base = JSON.parse(fs.readFileSync(basePath, 'utf8'));
    } catch (_) { continue; }
    if (!Array.isArray(pool) || pool.length < 6) continue;   // 풀이 충분해야 앵글 다양성 확보
    for (const data of angleArticles(base, pool)) {
      const out = path.join(ART, data.slug + '.json');
      if (fs.existsSync(out)) continue;                 // 이미 있으면 스킵
      fs.writeFileSync(out, JSON.stringify(data, null, 2));
      made.push(data.slug);
      if (made.length >= limit) return made;
    }
  }
  return made;
}

if (require.main === module) {
  const n = Number(process.argv[2]) || Infinity;
  const made = genAngles({ limit: n });
  console.log(`✓ 앵글 글 생성: ${made.length}개`);
}
module.exports = { genAngles };
