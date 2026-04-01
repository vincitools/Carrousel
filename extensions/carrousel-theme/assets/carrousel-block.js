(function () {
  'use strict';

  /* ── helpers ── */
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── lightbox ── */
  var _lb = null;

  function closeLightbox() {
    if (!_lb) return;
    var vid = _lb.querySelector('.crsl-lb__video');
    if (vid && vid.tagName === 'VIDEO') vid.pause();
    _lb.remove();
    _lb = null;
    document.body.style.overflow = '';
  }

  function openLightbox(item) {
    closeLightbox();
    document.body.style.overflow = 'hidden';

    var mediaHtml = item.type === 'VIDEO'
      ? '<video class="crsl-lb__video" src="' + esc(item.url || '') + '" autoplay loop muted playsinline></video>'
      : '<img class="crsl-lb__video" src="' + esc(item.url || item.thumbnail || '') + '" alt="' + esc(item.title) + '">';

    var productBar = '';
    if (item.productIds && item.productIds.length > 0) {
      productBar =
        '<div class="crsl-lb__product-bar">' +
          '<span class="crsl-lb__product-label">Produtos relacionados</span>' +
          '<a class="crsl-lb__shop-btn" href="/collections/all">Shop Now</a>' +
        '</div>';
    }

    _lb = document.createElement('div');
    _lb.className = 'crsl-lb';
    _lb.setAttribute('role', 'dialog');
    _lb.setAttribute('aria-modal', 'true');
    _lb.innerHTML =
      '<div class="crsl-lb__backdrop"></div>' +
      '<div class="crsl-lb__frame">' +
        '<div class="crsl-lb__media-wrap">' +
          mediaHtml +
          '<div class="crsl-lb__overlay">' +
            '<div class="crsl-lb__overlay-top">' +
              '<span class="crsl-lb__title">' + esc(item.title) + '</span>' +
              '<div class="crsl-lb__top-actions">' +
                '<button type="button" class="crsl-lb__btn crsl-lb__mute-btn" aria-label="Toggle sound">' +
                  '<svg class="crsl-icon-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>' +
                  '<svg class="crsl-icon-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' +
                '</button>' +
                '<button type="button" class="crsl-lb__btn crsl-lb__close-btn" aria-label="Fechar">' +
                  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        productBar +
      '</div>';

    document.body.appendChild(_lb);

    var vid = _lb.querySelector('.crsl-lb__video');
    if (vid && vid.tagName === 'VIDEO') {
      vid.muted = true;
      vid.play().catch(function () {});
    }

    /* close */
    _lb.querySelector('.crsl-lb__close-btn').addEventListener('click', closeLightbox);
    _lb.querySelector('.crsl-lb__backdrop').addEventListener('click', closeLightbox);

    /* mute toggle */
    var muteBtn = _lb.querySelector('.crsl-lb__mute-btn');
    if (muteBtn && vid && vid.tagName === 'VIDEO') {
      var isMuted = true;
      muteBtn.addEventListener('click', function () {
        isMuted = !isMuted;
        vid.muted = isMuted;
        muteBtn.querySelector('.crsl-icon-off').style.display = isMuted ? '' : 'none';
        muteBtn.querySelector('.crsl-icon-on').style.display  = isMuted ? 'none' : '';
      });
    }

    /* escape key */
    function onKey(e) {
      if (e.key === 'Escape') { closeLightbox(); document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);
  }

  /* ── render strip ── */
  function renderItems(root, items, heading) {
    var cards = items.map(function (item, idx) {
      var mediaHtml = item.type === 'VIDEO'
        ? '<video class="crsl-card__media" src="' + esc(item.url || '') +
          '" poster="' + esc(item.thumbnail || '') +
          '" autoplay loop muted playsinline preload="auto"></video>'
        : '<img class="crsl-card__media" loading="lazy" src="' +
          esc(item.thumbnail || item.url || '') + '" alt="' + esc(item.title) + '">';

      return (
        '<button type="button" class="crsl-card" data-idx="' + idx + '" aria-label="' + esc(item.title) + '">' +
          mediaHtml +
          '<div class="crsl-card__play" aria-hidden="true">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    root.innerHTML =
      (heading ? '<h3 class="crsl-heading">' + esc(heading) + '</h3>' : '') +
      '<div class="crsl-viewport">' +
        '<div class="crsl-track">' + cards + '</div>' +
      '</div>';

    /* click → lightbox */
    root.querySelectorAll('.crsl-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openLightbox(items[parseInt(btn.dataset.idx, 10)]);
      });
    });

    /* IntersectionObserver: play only visible strip videos */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          var v = entry.target;
          if (entry.isIntersecting) { v.play().catch(function () {}); }
          else { v.pause(); }
        });
      }, { threshold: 0.2 });

      root.querySelectorAll('.crsl-card__media').forEach(function (el) {
        if (el.tagName === 'VIDEO') io.observe(el);
      });
    }
  }

  /* ── hydrate ── */
  async function hydrate(root) {
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    var endpoint  = root.dataset.endpoint;
    var source    = root.dataset.source    || 'default';
    var playlist  = root.dataset.playlist  || '';
    var productId = root.dataset.productId || '';
    var limit     = root.dataset.limit     || '12';
    var heading   = root.dataset.heading   || '';

    var url = new URL(endpoint);
    url.searchParams.set('source', source);
    url.searchParams.set('limit',  limit);
    if (playlist)  url.searchParams.set('playlist',  playlist);
    if (productId) url.searchParams.set('productId', productId);

    var inEditor = window.Shopify && window.Shopify.designMode;

    try {
      var res = await fetch(url.toString(), { credentials: 'same-origin' });
      var payload = null;
      try { payload = await res.json(); } catch (_) {}

      if (!payload) {
        root.innerHTML = '<div class="crsl-empty"><p>' +
          (inEditor ? 'App proxy did not return JSON. Reinstall the app to fix.' : 'Unable to load carousel content right now.') +
          '</p></div>';
        return;
      }

      if (!res.ok || !payload.items || payload.items.length === 0) {
        root.innerHTML = '<div class="crsl-empty"><p>' +
          (inEditor ? (payload.error || 'No media matched the current settings yet.') : 'No media is available for this carousel.') +
          '</p></div>';
        return;
      }

      renderItems(root, payload.items, heading);
    } catch (err) {
      console.error('[carrousel-block]', err);
      root.innerHTML = '<div class="crsl-empty"><p>Unable to load carousel content right now.</p></div>';
    }
  }

  /* ── init ── */
  function init() {
    document.querySelectorAll('[data-carrousel-block]').forEach(hydrate);
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('shopify:section:load', function () {
    document.querySelectorAll('[data-carrousel-block]').forEach(function (el) {
      el.dataset.initialized = '';
      hydrate(el);
    });
  });
  document.addEventListener('shopify:block:select', init);
})();