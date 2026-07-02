const fs = require('fs');
const { parseCityLabel } = require('./slug');

/**
 * city_ids*.txt 파싱
 *   // 한국 (Korea)
 *   14690,   // 서울 (Seoul)
 */
function parseCityIdsText(text) {
  const regions = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    const cm = line.match(/^\s*\/\/\s*(.+?)\s*\(([^)]+)\)\s*$/);
    if (cm) {
      cur = { label: cm[1].trim(), countryEn: cm[2].trim(), cities: [] };
      regions.push(cur);
      continue;
    }
    const m = line.match(/^\s*(\d+)\s*,\s*(?:\/\/\s*(.+))?\s*$/);
    if (m && cur) {
      const { ko, en } = parseCityLabel(m[2] || '');
      cur.cities.push({ cityId: Number(m[1]), label: m[2] || '', name: ko || en, nameEn: en || ko });
    }
  }
  return regions;
}

function parseCityIdsFile(filePath) {
  return parseCityIdsText(fs.readFileSync(filePath, 'utf8'));
}

function formatCityIdsText(region) {
  const lines = [`  // ${region.label} (${region.countryEn})`];
  for (const c of region.cities) {
    const label = c.label || (c.nameEn && c.name !== c.nameEn ? `${c.name} (${c.nameEn})` : (c.name || c.nameEn || 'NULL'));
    lines.push(`    ${c.cityId},   // ${label}`);
  }
  return lines.join('\n');
}

module.exports = { parseCityIdsText, parseCityIdsFile, formatCityIdsText };
