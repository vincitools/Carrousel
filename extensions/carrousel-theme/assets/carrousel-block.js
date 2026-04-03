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

  function normalizePrice(value) {
    if (!value) return '';
    // Payload comes as "USD 305.95" from proxy.
    return String(value).replace(/^([A-Z]{3})\s+/, '$1 ');
  }

  function openLightbox(item) {
    closeLightbox();
    document.body.style.overflow = 'hidden';

    var mediaHtml = item.type === 'VIDEO'
      ? '<video class="crsl-lb__video" src="' + esc(item.url || '') + '" autoplay loop muted playsinline></video>'
      : '<img class="crsl-lb__video" src="' + esc(item.url || item.thumbnail || '') + '" alt="' + esc(item.title) + '">';

    var linked = item.linkedProduct || null;
    var productPane = '';

    if (linked) {
      productPane =
        '<aside class="crsl-lb__product-pane">' +
          '<div class="crsl-lb__product-card">' +
            '<div class="crsl-lb__product-image-wrap">' +
              '<img class="crsl-lb__product-image" src="' + esc(linked.image || item.thumbnail || '') + '" alt="' + esc(linked.title) + '">' +
            '</div>' +
            '<h4 class="crsl-lb__product-title">' + esc(linked.title) + '</h4>' +
            '<div class="crsl-lb__price-row">' +
              '<span class="crsl-lb__price">' + esc(normalizePrice(linked.price)) + '</span>' +
              (linked.compareAtPrice ? '<span class="crsl-lb__compare">' + esc(normalizePrice(linked.compareAtPrice)) + '</span>' : '') +
            '</div>' +
            '<div class="crsl-lb__actions">' +
              '<button type="button" class="crsl-lb__add-btn" data-handle="' + esc(linked.handle) + '">ADD TO CART</button>' +
              '<a class="crsl-lb__shop-btn" href="' + esc(linked.url || '/collections/all') + '">SHOP NOW</a>' +
            '</div>' +
          '</div>' +
        '</aside>';
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
        productPane +
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

    var addBtn = _lb.querySelector('.crsl-lb__add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async function () {
        var handle = addBtn.dataset.handle;
        if (!handle) return;
        addBtn.disabled = true;
        addBtn.textContent = 'ADDING...';
        try {
          var productRes = await fetch('/products/' + encodeURIComponent(handle) + '.js');
          var productData = await productRes.json();
          var variantId = productData && productData.variants && productData.variants[0] && productData.variants[0].id;
          if (!variantId) throw new Error('No purchasable variant found');

          var cartRes = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: variantId, quantity: 1 })
          });
          if (!cartRes.ok) throw new Error('Failed to add to cart');

          addBtn.textContent = 'ADDED';
        } catch (e) {
          addBtn.textContent = 'TRY AGAIN';
          setTimeout(function () {
            addBtn.textContent = 'ADD TO CART';
            addBtn.disabled = false;
          }, 1000);
          return;
        }
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
  /* ── design-mode playlist picker ── */
  async function appendDesignPicker(root) {
    var endpoint = root.dataset.endpoint;
    if (!endpoint) return;
    var listUrl = new URL(endpoint);
    listUrl.searchParams.set('mode', 'list');

    var playlists = [];
    try {
      var res = await fetch(listUrl.toString(), { credentials: 'same-origin' });
      var data = await res.json();
      playlists = data.playlists || [];
    } catch (_) { return; }

    if (playlists.length === 0) return;

    var currentName = (root.dataset.playlist || '').toLowerCase();
    var pills = playlists.map(function (p) {
      var active = p.name.toLowerCase() === currentName;
      return (
        '<button type="button" class="crsl-dm-pill' + (active ? ' crsl-dm-pill--active' : '') + '"' +
        ' data-name="' + esc(p.name) + '">' + esc(p.name) + '</button>'
      );
    }).join('');

    var picker = document.createElement('div');
    picker.className = 'crsl-dm-picker';
    picker.innerHTML =
      '<span class="crsl-dm-label">Playlists disponíveis:</span>' +
      '<div class="crsl-dm-pills">' + pills + '</div>';

    picker.querySelectorAll('.crsl-dm-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        root.dataset.playlist = this.dataset.name;
        root.dataset.initialized = '';
        hydrate(root);
      });
    });

    // Remove old picker if present, then append fresh one
    var old = root.querySelector('.crsl-dm-picker');
    if (old) old.remove();
    root.appendChild(picker);
  }

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
      } else if (!res.ok || !payload.items || payload.items.length === 0) {
        root.innerHTML = '<div class="crsl-empty"><p>' +
          (inEditor ? (payload.error || 'No media matched the current settings yet.') : 'No media is available for this carousel.') +
          '</p></div>';
      } else {
        renderItems(root, payload.items, heading);
      }
    } catch (err) {
      console.error('[carrousel-block]', err);
      root.innerHTML = '<div class="crsl-empty"><p>Unable to load carousel content right now.</p></div>';
    }

    if (inEditor) {
      appendDesignPicker(root); // fire-and-forget — renders below carousel
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