(function () {
  var GA_ID = 'G-GX291MMNNT';
  window.DH_GA4_MEASUREMENT_ID = GA_ID;
  if (window.__DH_GA4_INIT__) return;
  window.__DH_GA4_INIT__ = true;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function () { window.dataLayer.push(arguments); };
  }
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { anonymize_ip: true });
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=' + GA_ID + '"]')) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    (document.head || document.documentElement).appendChild(s);
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || a.hasAttribute('data-track-cta') || typeof window.gtag !== 'function') return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('gumroad.com') !== -1 || href.indexOf('smartstore.naver.com') !== -1 || href.indexOf('kmong.com') !== -1) {
      window.gtag('event', 'select_promotion', {
        promotion_name: href.indexOf('gumroad.com') !== -1 ? 'gumroad_outbound' : (href.indexOf('smartstore.naver.com') !== -1 ? 'smartstore_outbound' : 'kmong_outbound'),
        link_url: href.slice(0, 180)
      });
    }
  }, true);
})();
