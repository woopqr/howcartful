#!/usr/bin/env node
/**
 * city_ids 마스터 파일 → 국가별 city_ids_{region}.txt + {region}.json 생성
 * cities.json 시드 도시도 해당 국가 파일에 병합(중복 cityId 제거)
 *
 * 사용: node scripts/split-city-ids.js [마스터파일]
 * 기본 마스터: data/city-ids/city_ids.txt
 */
const fs = require('fs');
const path = require('path');
const { parseCityIdsText, formatCityIdsText } = require('../lib/city-ids-parser');
const { regionKey, COUNTRY_TO_REGION, IDS_DIR } = require('../lib/city-registry');

const ROOT = path.join(__dirname, '..');
const MASTER = process.argv[2] || path.join(IDS_DIR, 'city_ids.txt');
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const EN_COUNTRY = {
  '한국': 'Korea', '일본': 'Japan', '대만': 'Taiwan', '태국': 'Thailand',
  '베트남': 'Vietnam', '싱가포르': 'Singapore', '홍콩': 'Hong Kong',
  '말레이시아': 'Malaysia', '인도네시아': 'Indonesia', '필리핀': 'Philippines',
};

function seedFromCitiesJson() {
  const byRegion = {};
  const add = (list) => {
    for (const c of list) {
      if (!c || !c.cityId) continue;
      const rk = COUNTRY_TO_REGION[c.country] || regionKey(c.country, c.country);
      if (rk === 'china') continue;
      if (!byRegion[rk]) {
        byRegion[rk] = { label: c.country, countryEn: EN_COUNTRY[c.country] || c.country, cities: [] };
      }
      const label = c.nameEn ? `${c.name} (${c.nameEn})` : c.name;
      byRegion[rk].cities.push({
        cityId: c.cityId, slug: c.slug, label, name: c.name, nameEn: c.nameEn || c.name,
      });
    }
  };
  const main = path.join(ROOT, 'data', 'cities.json');
  if (fs.existsSync(main)) add(readJSON(main));
  const pool = path.join(ROOT, 'data', 'cities-pool.json');
  if (fs.existsSync(pool)) add(readJSON(pool));
  return byRegion;
}

function mergeRegions(...maps) {
  const out = {};
  for (const m of maps) {
    for (const [rk, reg] of Object.entries(m)) {
      if (!out[rk]) out[rk] = { label: reg.label, countryEn: reg.countryEn, cities: [] };
      const seen = new Set(out[rk].cities.map(c => c.cityId));
      for (const c of reg.cities) {
        if (seen.has(c.cityId)) continue;
        seen.add(c.cityId);
        out[rk].cities.push(c);
      }
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(IDS_DIR, { recursive: true });

  let fromMaster = {};
  if (fs.existsSync(MASTER)) {
    const regions = parseCityIdsText(fs.readFileSync(MASTER, 'utf8'));
    for (const r of regions) {
      const rk = regionKey(r.label, r.countryEn);
      fromMaster[rk] = r;
    }
    console.log(`✓ 마스터 파싱: ${MASTER} (${regions.length}개 국가/지역)`);
  } else {
    console.log(`· 마스터 없음 — ${MASTER}`);
  }

  const merged = mergeRegions(seedFromCitiesJson(), fromMaster);
  const meta = {};

  for (const [rk, reg] of Object.entries(merged)) {
    meta[rk] = { label: reg.label, countryEn: reg.countryEn, count: reg.cities.length };
    const header = `const cityIds = [\n${formatCityIdsText(reg)}\n];\n`;
    fs.writeFileSync(path.join(IDS_DIR, `city_ids_${rk}.txt`), header);
    fs.writeFileSync(path.join(IDS_DIR, `${rk}.json`), JSON.stringify(reg.cities, null, 2) + '\n');
    console.log(`  ${rk}: ${reg.cities.length}개 → city_ids_${rk}.txt`);
  }

  fs.writeFileSync(path.join(IDS_DIR, 'regions-meta.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`✓ ${Object.keys(merged).length}개 지역 파일 → ${IDS_DIR}`);
}

main();
