(function (global) {
  'use strict';

  var STORAGE_KEY = 'autoflow_lang';
  var LEGACY_KEYS = ['autoflow_landing_lang', 'autoflow_checkout_lang'];
  var INTERNAL_HTML_RE = /(?:^|\/)(index|autoflow|reconflow|picflow|oneshot|smartgrid|checkout|order_success|order_fail|chaos_sandbox|client_rfp_form|setup_wizard|settlement-gap|ecom-margin-sim|pure-track-matcher)\.html(?:$|[?#])|\/demo\/?(?:$|[?#])|\.\.?\/(?:index\.html)?(?:$|[?#])|^\.\/?(?:$|[?#])/i;

  function norm(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function getUrlLangParam() {
    try {
      var v = (new URLSearchParams(global.location.search).get('lang') || '').toLowerCase();
      return (v === 'en' || v === 'ko') ? v : '';
    } catch (_) {
      return '';
    }
  }

  function getStoredLang() {
    try {
      var keys = [STORAGE_KEY].concat(LEGACY_KEYS);
      for (var i = 0; i < keys.length; i++) {
        var v = (global.localStorage.getItem(keys[i]) || '').toLowerCase();
        if (v === 'en' || v === 'ko') return v;
      }
    } catch (_) {}
    return '';
  }

  function detectBrowserLang() {
    try {
      var nav = (global.navigator && (global.navigator.language || (global.navigator.languages && global.navigator.languages[0]))) || 'ko';
      return /^ko\b/i.test(String(nav)) ? 'ko' : 'en';
    } catch (_) {
      return 'ko';
    }
  }

  function resolveInitialLang(opts) {
    var options = opts || {};
    var urlLang = getUrlLangParam();
    if (urlLang) return urlLang;
    if (options.skuLang === 'en' || options.skuLang === 'ko') return options.skuLang;
    var saved = getStoredLang();
    if (saved) return saved;
    return detectBrowserLang();
  }

  var currentLang = resolveInitialLang();
  var docTitleKoOrig = null;

  function setStoredLang(lang) {
    try {
      global.localStorage.setItem(STORAGE_KEY, lang);
      for (var i = 0; i < LEGACY_KEYS.length; i++) {
        global.localStorage.setItem(LEGACY_KEYS[i], lang);
      }
    } catch (_) {}
  }

  function getDomDict() {
    return (global.AF_DOM_EN_MAP && typeof global.AF_DOM_EN_MAP === 'object')
      ? global.AF_DOM_EN_MAP
      : { leaf: {}, richByPlain: {}, attrs: {} };
  }

  function isSkippableTag(tagName) {
    return /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|TEXTAREA)$/i.test(tagName || '');
  }

  function applyAttributesTranslation(lang, attrsDict) {
    if (docTitleKoOrig === null) docTitleKoOrig = document.title;
    if (lang === 'en') {
      var titleKey = '@doc_title:' + norm(docTitleKoOrig);
      if (attrsDict[titleKey]) document.title = attrsDict[titleKey];
    } else if (docTitleKoOrig !== null) {
      document.title = docTitleKoOrig;
    }

    var attrNames = ['placeholder', 'aria-label', 'title'];
    for (var a = 0; a < attrNames.length; a++) {
      var attr = attrNames[a];
      var dataKey = 'afKoAttr_' + attr.replace(/-/g, '_');
      var els = document.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el.dataset[dataKey] && el.dataset[dataKey] !== '') {
          el.dataset[dataKey] = el.getAttribute(attr) || '';
        }
        var origVal = el.dataset[dataKey];
        if (lang === 'en') {
          var hit = attrsDict['@' + attr + ':' + norm(origVal)];
          if (hit) el.setAttribute(attr, hit);
        } else if (origVal) {
          el.setAttribute(attr, origVal);
        }
      }
    }
  }

  function hasInteractiveOrIdChild(el) {
    if (!el || !el.querySelectorAll) return false;
    var nodes = el.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.id || n.getAttribute('onclick') || /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/i.test(n.tagName)) {
        return true;
      }
    }
    return false;
  }

  function applyRichBlocks(lang, richByPlain) {
    if (!document.body || !richByPlain) return [];
    var matchedRichRoots = [];
    var candidates = document.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th, dd, dt, summary, span');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.hasAttribute('data-i18n')) continue;
      if (el._afKoHtml !== undefined) {
        if (lang === 'en' && el._afEnHtml) {
          el.innerHTML = el._afEnHtml;
          matchedRichRoots.push(el);
        } else if (lang === 'ko') {
          el.innerHTML = el._afKoHtml;
        }
        continue;
      }
      if (lang !== 'en') continue;
      if (!el.children || el.children.length === 0) continue;
      if (hasInteractiveOrIdChild(el)) continue;

      var plain = norm(el.textContent);
      if (!plain || !/[가-힣]/.test(plain)) continue;
      var enHtml = richByPlain[plain];
      if (!enHtml) continue;

      el._afKoHtml = el.innerHTML;
      var svgs = [];
      var svgNodes = el.querySelectorAll('svg');
      for (var s = 0; s < svgNodes.length; s++) {
        svgs.push(svgNodes[s].outerHTML);
      }
      var rendered = enHtml;
      for (var sIdx = 0; sIdx < svgs.length; sIdx++) {
        rendered = rendered.replace('[[AF_SVG]]', svgs[sIdx]);
      }
      rendered = rendered.replace(/\[\[AF_SVG\]\]/g, '');
      el._afEnHtml = rendered;
      el.innerHTML = rendered;
      matchedRichRoots.push(el);
    }
    return matchedRichRoots;
  }

  function isInsideList(node, list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].contains(node)) return true;
    }
    return false;
  }

  function applyLeafTextNodes(lang, leafDict, skipRoots) {
    if (!document.body || !leafDict) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var parent = node.parentElement;
      if (!parent || isSkippableTag(parent.tagName)) continue;
      if (parent.closest && parent.closest('[data-i18n], [data-af-no-i18n]')) continue;
      if (isInsideList(parent, skipRoots)) continue;

      if (node._afKoText === undefined) {
        node._afKoText = node.nodeValue;
      }
      if (lang === 'en') {
        var orig = node._afKoText;
        var m = orig.match(/^(\s*)([\s\S]*?)(\s*)$/);
        if (!m) continue;
        var core = norm(m[2]);
        if (!core || !/[가-힣]/.test(core)) continue;
        var enVal = leafDict[core];
        if (enVal) {
          node.nodeValue = m[1] + enVal + m[3];
        }
      } else if (node._afKoText !== undefined) {
        if (node.nodeValue !== node._afKoText) {
          node.nodeValue = node._afKoText;
        }
      }
    }
  }

  function propagateLinksLang(lang) {
    var anchors = document.querySelectorAll('a[href]');
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href) || /^mailto:/i.test(href) || /^tel:/i.test(href)) continue;
      try {
        var resolved = new URL(href, global.location.href);
        if (resolved.origin !== global.location.origin) continue;
        if (!INTERNAL_HTML_RE.test(resolved.pathname + resolved.search)) continue;
        if (!a.dataset.afOrigHref) a.dataset.afOrigHref = href;
        resolved.searchParams.set('lang', lang);
        var hashPart = resolved.hash || '';
        a.setAttribute('href', resolved.pathname + resolved.search + hashPart);
      } catch (_) {}
    }
  }

  function updateToggleButtonsUi(lang) {
    var activeLand = 'whitespace-nowrap px-2 py-1 rounded-md bg-sky-600 text-white transition-colors';
    var idleLand = 'whitespace-nowrap px-2 py-1 rounded-md text-[#18181B] dark:text-slate-200 hover:text-sky-700 transition-colors';
    var activeChk = 'px-2 py-1 rounded-md bg-sky-600 text-white transition';
    var idleChk = 'px-2 py-1 rounded-md text-slate-800 dark:text-slate-200 hover:text-sky-600 transition';
    var pairs = [
      ['btnLangKo', 'btnLangEn', activeLand, idleLand],
      ['btnCheckoutLangKo', 'btnCheckoutLangEn', activeChk, idleChk],
      ['afAutoLangKo', 'afAutoLangEn', 'af-lang-btn is-active', 'af-lang-btn']
    ];
    for (var i = 0; i < pairs.length; i++) {
      var ko = document.getElementById(pairs[i][0]);
      var en = document.getElementById(pairs[i][1]);
      if (!ko || !en) continue;
      ko.className = (lang === 'ko') ? pairs[i][2] : pairs[i][3];
      en.className = (lang === 'en') ? pairs[i][2] : pairs[i][3];
      ko.setAttribute('aria-pressed', lang === 'ko' ? 'true' : 'false');
      en.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
    }
  }

  function injectSubpageToggleStyle() {
    if (document.getElementById('af-i18n-toggle-style')) return;
    var style = document.createElement('style');
    style.id = 'af-i18n-toggle-style';
    style.textContent =
      '.af-lang-toggle{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:8px;background:#F0EFEA;border:1px solid #D4D1C7;flex-shrink:0;}' +
      '.af-lang-btn{border:none;background:transparent;color:#3F3E3A;font-family:inherit;font-size:12px;font-weight:700;padding:4px 8px;border-radius:6px;cursor:pointer;line-height:1.2;white-space:nowrap;}' +
      '.af-lang-btn.is-active{background:#14532D;color:#FFFFFF;}' +
      '#catalogGrid > *, .grid > * { min-width: 0; }' +
      '.topbar-inner .nav-links, .top-status-bar .nav-links, .topbar .nav-actions, .topbar .tools { flex-wrap: wrap; min-width: 0; }' +
      '@media (max-width: 640px) { .af-hdr-right { flex-wrap: wrap; justify-content: flex-end; max-width: 100%; } }';
    document.head.appendChild(style);
  }

  function mountSubpageSwitcherIfMissing() {
    if (document.getElementById('btnLangKo') || document.getElementById('btnCheckoutLangKo') || document.getElementById('afAutoLangToggle')) {
      return;
    }
    var target =
      document.querySelector('.af-hdr-right') ||
      document.querySelector('.top-status-bar .nav-links') ||
      document.querySelector('.topbar .nav-links') ||
      document.querySelector('.topbar .tools') ||
      document.querySelector('.topbar .nav-actions');
    if (!target) return;

    injectSubpageToggleStyle();
    var wrap = document.createElement('div');
    wrap.id = 'afAutoLangToggle';
    wrap.className = 'af-lang-toggle';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Language switcher');

    var bKo = document.createElement('button');
    bKo.id = 'afAutoLangKo';
    bKo.type = 'button';
    bKo.textContent = 'KO';
    bKo.setAttribute('translate', 'no');
    bKo.onclick = function () { afSetLang('ko', true); };

    var bEn = document.createElement('button');
    bEn.id = 'afAutoLangEn';
    bEn.type = 'button';
    bEn.textContent = 'EN';
    bEn.setAttribute('translate', 'no');
    bEn.onclick = function () { afSetLang('en', true); };

    wrap.appendChild(bKo);
    wrap.appendChild(bEn);
    target.insertBefore(wrap, target.firstChild);
  }

  function afApplyDomI18n(lang) {
    var dict = getDomDict();
    applyAttributesTranslation(lang, dict.attrs || {});
    var skipRoots = applyRichBlocks(lang, dict.richByPlain || {});
    applyLeafTextNodes(lang, dict.leaf || {}, skipRoots);
    propagateLinksLang(lang);
    updateToggleButtonsUi(lang);
  }

  function afSetLang(lang, persist) {
    var next = (lang === 'en') ? 'en' : 'ko';
    currentLang = next;
    if (persist !== false) setStoredLang(next);
    document.documentElement.lang = next;
    injectSubpageToggleStyle();
    mountSubpageSwitcherIfMissing();
    afApplyDomI18n(next);
    if (typeof global.onAfLangChanged === 'function') {
      try { global.onAfLangChanged(next); } catch (_) {}
    }
    try {
      global.dispatchEvent(new CustomEvent('af-lang-change', { detail: { lang: next } }));
    } catch (_) {}
    return next;
  }

  global.afGetLang = function () { return currentLang; };
  global.afResolveLang = resolveInitialLang;
  global.afSetLang = afSetLang;
  global.afApplyDomI18n = afApplyDomI18n;
  global.afMountSubpageSwitcher = mountSubpageSwitcherIfMissing;

  document.addEventListener('DOMContentLoaded', function () {
    // Pages with explicit SKU init (index/checkout) can call afSetLang explicitly;
    // generic subpages auto-apply cleanly after DOM ready if they didn't run yet.
    if (!global.__AF_MANUAL_I18N_INIT__) {
      afSetLang(resolveInitialLang(), false);
    }
  });
})(window);
