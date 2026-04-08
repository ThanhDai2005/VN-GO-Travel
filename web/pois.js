/**
 * POI data helpers for the landing page.
 * Source of truth: pois.json (copy of app Resources/Raw/pois.json — resync when POIs change).
 */
(function (global) {
  'use strict';

  /**
   * @returns {Promise<object[]>}
   */
  async function loadPois() {
    const res = await fetch(new URL('/pois.json', global.location.origin));
    if (!res.ok) throw new Error('Failed to load pois.json: ' + res.status);
    const data = await res.json();
    console.log('[WEB-POI] pois.json loaded, records=', Array.isArray(data) ? data.length : 0);
    return data;
  }

  function normalizePoiCode(code) {
    if (code == null) return '';
    return String(code).trim().toUpperCase();
  }

  /**
   * Pick one record for web display: prefer Vietnamese, else first match.
   * @param {object[]} records
   * @param {string} rawCode
   * @returns {object|null}
   */
  function findPoiForWeb(records, rawCode) {
    const n = normalizePoiCode(rawCode);
    if (!n) return null;
    const matches = records.filter((p) => normalizePoiCode(p.Code) === n);
    if (matches.length === 0) return null;
    const vi = matches.find((p) => String(p.LanguageCode || '').toLowerCase() === 'vi');
    return vi || matches[0];
  }

  global.PoisWeb = { loadPois, normalizePoiCode, findPoiForWeb };
})(typeof window !== 'undefined' ? window : globalThis);
