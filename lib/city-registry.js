const fs = require('fs');
const path = require('path');
const { slugify, parseCityLabel } = require('./slug');
const { parseCityIdsFile } = require('./city-ids-parser');

const ROOT = path.join(__dirname, '..');
const IDS_DIR = path.join(ROOT, 'data', 'city-ids');
const readJSON = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const COUNTRY_TO_REGION = {
  '한국': 'korea', '대한민국': 'korea', 'korea': 'korea', 'south korea': 'korea',
  '일본': 'japan', 'japan': 'japan',
  '대만': 'taiwan', 'taiwan': 'taiwan',
  '태국': 'thailand', 'thailand': 'thailand',
  '베트남': 'vietnam', 'vietnam': 'vietnam',
  '싱가포르': 'singapore', 'singapore': 'singapore',
  '말레이시아': 'malaysia', 'malaysia': 'malaysia',
  '인도네시아': 'indonesia', 'indonesia': 'indonesia',
  '필리핀': 'philippines', 'philippines': 'philippines',
  '홍콩': 'hongkong', 'hong kong': 'hongkong',
  '호주': 'australia', 'australia': 'australia',
  '중국': 'china', 'china': 'china',
};

function regionKey(label, countryEn) {
  const a = COUNTRY_TO_REGION[String(label || '').trim().toLowerCase()];
  const b = COUNTRY_TO_REGION[String(countryEn || '').trim().toLowerCase()];
  return a || b || slugify(countryEn || label) || 'other';
}

function loadManifest() {
  const p = path.join(IDS_DIR, 'manifest.json');
  if (!fs.existsSync(p)) return { regionOrder: [], excludeRegions: ['china'] };
  return readJSON(p);
}

function legacySlugByCityId() {
  const map = {};
  for (const file of ['cities.json', 'cities-pool.json']) {
    const p = path.join(ROOT, 'data', file);
    if (!fs.existsSync(p)) continue;
    for (const c of readJSON(p)) if (c.cityId && c.slug) map[c.cityId] = c.slug;
  }
  return map;
}

function slugFor(city, region, legacy) {
  if (city.slug) return city.slug;
  if (legacy[city.cityId]) return legacy[city.cityId];
  const en = city.nameEn || city.name || '';
  const base = slugify(en) || slugify(city.name) || `city-${city.cityId}`;
  const prefixed = `${region}-${base}`;
  return prefixed.length > 64 ? `${region}-${city.cityId}` : prefixed;
}

function loadRegionFile(region) {
  const jsonPath = path.join(IDS_DIR, `${region}.json`);
  if (fs.existsSync(jsonPath)) return readJSON(jsonPath);
  const txtPath = path.join(IDS_DIR, `city_ids_${region}.txt`);
  if (!fs.existsSync(txtPath)) return [];
  const parsed = parseCityIdsFile(txtPath);
  return (parsed[0] && parsed[0].cities) || [];
}

function toCityEntries(rawCities, region, countryLabel, legacy) {
  return rawCities
    .filter(c => c.cityId && !/^NULL$/i.test(c.label || c.name || ''))
    .map(c => ({
      cityId: c.cityId,
      slug: c.slug || slugFor(c, region, legacy),
      name: c.name || c.nameEn || String(c.cityId),
      nameEn: c.nameEn || c.name || '',
      country: countryLabel || region,
      region,
    }));
}

/** manifest 순서대로 전체 도시 목록 (중국 제외) */
function loadAllCities() {
  const manifest = loadManifest();
  const exclude = new Set((manifest.excludeRegions || ['china']).map(String));
  const legacy = legacySlugByCityId();
  const seenId = new Set();
  const out = [];

  const metaPath = path.join(IDS_DIR, 'regions-meta.json');
  const meta = fs.existsSync(metaPath) ? readJSON(metaPath) : {};

  for (const region of manifest.regionOrder || []) {
    if (exclude.has(region)) continue;
    const raw = loadRegionFile(region);
    const label = (meta[region] && meta[region].label) || region;
    for (const c of toCityEntries(raw, region, label, legacy)) {
      if (seenId.has(c.cityId)) continue;
      seenId.add(c.cityId);
      out.push(c);
    }
  }
  return out;
}

function defaultFetchState() {
  return { regionIndex: 0, cityIndex: 0, regionFails: 0, skippedIds: [] };
}

function normalizeFetchState(q, manifest) {
  const st = { ...defaultFetchState(), ...(q.fetchState || {}) };
  const order = manifest.regionOrder || [];
  if (st.regionIndex >= order.length) st.regionIndex = 0;
  if (!Array.isArray(st.skippedIds)) st.skippedIds = [];
  return st;
}

function isSkipped(cityId, st) {
  return st.skippedIds.includes(cityId);
}

function markSkipped(st, cityId, maxSkipped = 5000) {
  if (!st.skippedIds.includes(cityId)) st.skippedIds.push(cityId);
  if (st.skippedIds.length > maxSkipped) st.skippedIds = st.skippedIds.slice(-maxSkipped);
}

function enrichCity(raw, region, legacy) {
  const metaPath = path.join(IDS_DIR, 'regions-meta.json');
  const meta = fs.existsSync(metaPath) ? readJSON(metaPath) : {};
  const label = (meta[region] && meta[region].label) || region;
  const [c] = toCityEntries([raw], region, label, legacy);
  return c;
}

/**
 * manifest·커서 기준 다음 수집 대상 (신규)
 *  - 이미 만든 글·큐·발행 대기 중이면 건너뜀
 *  - skippedIds·NULL 도시 건너뜀
 */
function pickNextFromRegistry(state, { made, known, manifest }) {
  const legacy = legacySlugByCityId();
  const exclude = new Set((manifest.excludeRegions || ['china']).map(String));
  const order = (manifest.regionOrder || []).filter(r => !exclude.has(r));

  while (state.regionIndex < order.length) {
    const region = order[state.regionIndex];
    const rawList = loadRegionFile(region);
    while (state.cityIndex < rawList.length) {
      const raw = rawList[state.cityIndex++];
      const city = enrichCity(raw, region, legacy);
      if (!city) continue;
      if (/^NULL$/i.test(raw.label || raw.name || '')) continue;
      if (isSkipped(city.cityId, state)) continue;
      if (made.has(city.slug)) continue;
      if (known.has(city.slug)) continue;
      return { city, mode: 'new', region };
    }
    state.regionIndex++;
    state.cityIndex = 0;
    state.regionFails = 0;
  }
  return null;
}

function advanceRegionOnFailures(state, manifest) {
  const threshold = manifest.regionFailThreshold || 5;
  if (state.regionFails < threshold) return false;
  const exclude = new Set((manifest.excludeRegions || ['china']).map(String));
  const order = (manifest.regionOrder || []).filter(r => !exclude.has(r));
  const from = order[state.regionIndex] || '?';
  state.regionIndex++;
  state.cityIndex = 0;
  state.regionFails = 0;
  const to = order[state.regionIndex] || '(끝)';
  console.log(`↷ 지역 스킵: ${from} — 연속 ${threshold}회 실패 → ${to}`);
  return true;
}

module.exports = {
  IDS_DIR, COUNTRY_TO_REGION, regionKey,
  loadManifest, loadAllCities, loadRegionFile,
  defaultFetchState, normalizeFetchState, isSkipped, markSkipped,
  pickNextFromRegistry, advanceRegionOnFailures, enrichCity,
  legacySlugByCityId, slugFor, toCityEntries, parseCityLabel,
};
