const { loadAllCities } = require('./city-registry');

/** 전체 도시 목록 (manifest 순서, 중국 제외) */
function loadCities() {
  return loadAllCities();
}

module.exports = { loadCities };
