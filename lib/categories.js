/**
 * 카테고리(국가·시즌) 분류 유틸 — build-all이 사용
 *  - 국가: city.region(정규화 키) + city.country(표시 라벨)
 *  - 시즌: data/seasons.json (region 기본값 + city override)
 */
const fs = require('fs');
const path = require('path');
const { loadCities } = require('./cities');

const SEASONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'seasons.json'), 'utf8'));
const byId = {}; loadCities().forEach(c => { byId[c.cityId] = c; });

const SEASON_KEY = { '봄': 'spring', '여름': 'summer', '가을': 'autumn', '겨울': 'winter' };
const SEASON_LABEL = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const SEASON_EMOJI = { spring: '🌸', summer: '🏖️', autumn: '🍁', winter: '❄️' };
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

function cityOf(article) { return byId[article.cityId] || null; }

function regionOf(article) {
  const c = cityOf(article);
  if (!c || !c.region) return null;
  return { key: c.region, label: c.country || c.region };
}

function seasonsOf(article) {
  const c = cityOf(article);
  if (!c) return [];
  const ko = SEASONS.cityOverrides[c.slug] || SEASONS.regionSeasons[c.region] || [];
  return ko.map(k => SEASON_KEY[k]).filter(Boolean);
}

function currentSeason(d = new Date()) {
  const m = d.getMonth() + 1;
  return m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : m <= 11 ? 'autumn' : 'winter';
}

module.exports = {
  cityOf, regionOf, seasonsOf, currentSeason,
  SEASON_LABEL, SEASON_EMOJI, SEASON_ORDER,
};
