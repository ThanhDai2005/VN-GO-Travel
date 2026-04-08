/**
 * POI landing + web-to-app handoff.
 * Route: /poi/{CODE} (Netlify rewrite → index.html)
 * Contract: ../../docs/QR_MODULE.md
 */
(function () {
  'use strict';

  /** Public site (must match Android intent-filter host for app open). */
  const PRODUCTION_HOST = 'thuyetminh.netlify.app';
  const ANDROID_PACKAGE = 'com.companyname.mauiapp1';

  const log = (...args) => console.log('[WEB-POI]', ...args);

  function parseRouteCode() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const segments = path.split('/').filter(Boolean);
    log('pathname=', path, 'segments=', segments);
    if (segments.length >= 2 && segments[0].toLowerCase() === 'poi') {
      return decodeURIComponent(segments[1]);
    }
    return null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function setVisible(id, on) {
    const node = el(id);
    if (node) node.hidden = !on;
  }

  function showFallbackBanner() {
    const b = el('fallbackBanner');
    if (b) b.hidden = false;
  }

  function buildHttpsPoiUrl(code) {
    const c = PoisWeb.normalizePoiCode(code);
    return `https://${PRODUCTION_HOST}/poi/${encodeURIComponent(c)}`;
  }

  /**
   * Android: intent URL with package + browser fallback (current page if app missing).
   * Host must match an https intent-filter on the app (see MainActivity).
   */
  function buildAndroidIntentUrl(code) {
    const c = PoisWeb.normalizePoiCode(code);
    const path = `poi/${encodeURIComponent(c)}`;
    const fallback = encodeURIComponent(window.location.href.split('#')[0]);
    return (
      `intent://${PRODUCTION_HOST}/${path}#Intent;` +
      'scheme=https;' +
      `package=${ANDROID_PACKAGE};` +
      'action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'category=android.intent.category.DEFAULT;' +
      `S.browser_fallback_url=${fallback};` +
      'end'
    );
  }

  function openInApp(code) {
    const normalized = PoisWeb.normalizePoiCode(code);
    log('open-in-app click code=', code, 'normalized=', normalized);

    showFallbackBanner();

    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);

    if (isAndroid) {
      const intentUrl = buildAndroidIntentUrl(normalized);
      log('navigating intent URL');
      window.location.href = intentUrl;
      return;
    }

    // iOS / desktop: same https link (Universal Links / user copies / opens in browser)
    const httpsUrl = buildHttpsPoiUrl(normalized);
    log('non-Android: open https', httpsUrl);
    window.location.href = httpsUrl;
  }

  async function copyCode(code) {
    const c = PoisWeb.normalizePoiCode(code);
    try {
      await navigator.clipboard.writeText(c);
      log('clipboard copied', c);
      const hint = el('copyHint');
      if (hint) {
        hint.textContent = 'Đã sao chép mã: ' + c;
        hint.hidden = false;
        setTimeout(() => {
          hint.hidden = true;
        }, 2500);
      }
    } catch (e) {
      console.warn('[WEB-POI] clipboard failed', e);
      prompt('Sao chép mã địa điểm:', c);
    }
  }

  function goHome() {
    window.location.href = '/';
  }

  function renderHome() {
    setVisible('viewHome', true);
    setVisible('viewPoi', false);
    setVisible('viewNotFound', false);
    log('view=home');
  }

  function renderNotFound(rawCode) {
    setVisible('viewHome', false);
    setVisible('viewPoi', false);
    setVisible('viewNotFound', true);
    el('nfCode').textContent = PoisWeb.normalizePoiCode(rawCode) || rawCode || '—';
    log('POI not found for code=', rawCode);
  }

  function renderPoi(poi, code) {
    setVisible('viewHome', false);
    setVisible('viewNotFound', false);
    setVisible('viewPoi', true);

    el('poiName').textContent = poi.Name || '—';
    el('poiSummary').textContent = poi.Summary || '';
    el('poiCode').textContent = PoisWeb.normalizePoiCode(code);
    el('poiLang').textContent = poi.LanguageCode || '';

    const btnApp = el('btnOpenApp');
    const btnCopy = el('btnCopy');
    btnApp.onclick = () => openInApp(code);
    btnCopy.onclick = () => copyCode(code);

    log('POI found name=', poi.Name, 'code=', PoisWeb.normalizePoiCode(code));
  }

  function hideLoading() {
    const loading = el('viewLoading');
    if (loading) loading.hidden = true;
  }

  async function boot() {
    log('boot href=', window.location.href);

    const routeCode = parseRouteCode();

    if (!routeCode) {
      renderHome();
      hideLoading();
      return;
    }

    const normalized = PoisWeb.normalizePoiCode(routeCode);
    log('route raw=', routeCode, 'normalized=', normalized);

    try {
      const records = await PoisWeb.loadPois();
      const poi = PoisWeb.findPoiForWeb(records, normalized);
      if (!poi) {
        renderNotFound(routeCode);
        hideLoading();
        return;
      }
      renderPoi(poi, normalized);
      hideLoading();
    } catch (e) {
      console.error('[WEB-POI] boot error', e);
      el('fatalMessage').textContent =
        'Không tải được dữ liệu địa điểm. Thử làm mới trang.';
      setVisible('viewFatal', true);
      setVisible('viewHome', false);
      setVisible('viewPoi', false);
      setVisible('viewNotFound', false);
      hideLoading();
    }
  }

  el('btnHomeFromNf')?.addEventListener('click', goHome);
  el('btnHomeHeader')?.addEventListener('click', goHome);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
