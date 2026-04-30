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

  function stripHtml(value) {
    return String(value || '')
      .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  function splitSentences(text) {
    var matches = String(text || '').match(/[^.!?]+[.!?]?/g);
    if (!matches) return [];
    return matches.map(function (part) { return part.trim(); }).filter(Boolean);
  }

  var TRACK_SESSION_KEY = 'carrousel_session_id';
  var _cartTokenPromise = null;

  function getSessionId() {
    try {
      var existing = window.localStorage.getItem(TRACK_SESSION_KEY);
      if (existing) return existing;
      var generated = 'crsl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(TRACK_SESSION_KEY, generated);
      return generated;
    } catch (_) {
      return 'crsl_' + Date.now();
    }
  }

  function getCartToken() {
    if (_cartTokenPromise) return _cartTokenPromise;
    _cartTokenPromise = fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (payload) { return payload && payload.token ? String(payload.token) : ''; })
      .catch(function () { return ''; });
    return _cartTokenPromise;
  }

  function sendTrackEvent(root, item, eventType, extras) {
    if (!root || !item || !eventType) return;
    var endpoint = root.dataset.trackEndpoint || '';
    if (!endpoint) return;

    getCartToken().then(function (cartToken) {
      var payload = Object.assign(
        {
          eventType: eventType,
          sessionId: getSessionId(),
          videoId: item.id || null,
          playlistName: root.dataset.playlist || null,
          source: root.dataset.source || 'default',
          cartToken: cartToken || null
        },
        extras || {}
      );

      fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {
        // Ignore analytics tracking errors in storefront runtime.
      });
    });
  }

  function getDescriptionPreview(value, limit) {
    var text = stripHtml(String(value || '').replace(/\r/g, '\n'));
    var normalized = splitSentences(text).join(' ').trim() || text;
    if (!normalized) return '';
    return normalized.slice(0, limit).trim();
  }

  function renderDescription(container, previewText, productUrl) {
    if (!container) return;
    if (!previewText) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }

    container.innerHTML =
      '<p class="crsl-lb__product-desc-p">' +
        esc(previewText) +
        '<a class="crsl-lb__product-desc-link" href="' + esc(productUrl || '/collections/all') + '">...read more.</a>' +
      '</p>';
    container.style.display = '';
  }

  async function hydrateProductDescription(handle, productUrl, container) {
    if (!handle || !container) return;
    try {
      var response = await fetch('/products/' + encodeURIComponent(handle) + '.js');
      if (response.ok) {
        var payload = await response.json();
        var jsSource = payload && (payload.description || payload.body_html || payload.bodyHtml || '');
        var jsPreview = getDescriptionPreview(jsSource, 240);
        if (jsPreview) {
          renderDescription(container, jsPreview, productUrl);
          return;
        }
      }
    } catch (_) {
      // Try HTML fallback below.
    }

    try {
      var htmlResponse = await fetch(productUrl || ('/products/' + encodeURIComponent(handle)));
      if (!htmlResponse.ok) return;
      var html = await htmlResponse.text();
      var metaMatch =
        html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
        html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
      var htmlPreview = getDescriptionPreview(metaMatch && metaMatch[1] ? metaMatch[1] : '', 240);
      renderDescription(container, htmlPreview, productUrl);
    } catch (_) {
      // Keep modal clean even if product endpoint is unavailable.
    }
  }

  function openLightbox(root, items, startIndex) {
    closeLightbox();
    document.body.style.overflow = 'hidden';

    var activeIndex = startIndex;
    var isMuted = true;
    var trackedPlayByVideo = Object.create(null);

    function renderMedia(item) {
      return item.type === 'VIDEO'
        ? '<video class="crsl-lb__video" src="' + esc(item.url || '') + '" autoplay loop muted playsinline></video>'
        : '<img class="crsl-lb__video" src="' + esc(item.url || item.thumbnail || '') + '" alt="' + esc(item.title) + '">';
    }

    function renderProductPane(item) {
      var linked = item.linkedProduct || null;
      if (!linked) return '<aside class="crsl-lb__product-pane" data-lightbox-product></aside>';

      return (
        '<aside class="crsl-lb__product-pane" data-lightbox-product>' +
          '<div class="crsl-lb__product-card">' +
            '<div class="crsl-lb__product-image-wrap">' +
              '<img class="crsl-lb__product-image" src="' + esc(linked.image || item.thumbnail || '') + '" alt="' + esc(linked.title) + '">' +
            '</div>' +
            '<h4 class="crsl-lb__product-title">' + esc(linked.title) + '</h4>' +
            '<div class="crsl-lb__price-row">' +
              '<span class="crsl-lb__price">' + esc(normalizePrice(linked.price)) + '</span>' +
              (linked.compareAtPrice ? '<span class="crsl-lb__compare">' + esc(normalizePrice(linked.compareAtPrice)) + '</span>' : '') +
            '</div>' +
            '<div class="crsl-lb__product-desc" data-product-desc></div>' +
            '<div class="crsl-lb__actions">' +
              '<button type="button" class="crsl-lb__add-btn" data-handle="' + esc(linked.handle) + '">ADD TO CART</button>' +
              '<a class="crsl-lb__shop-btn" href="' + esc(linked.url || '/collections/all') + '">VIEW PRODUCT</a>' +
            '</div>' +
          '</div>' +
        '</aside>'
      );
    }

    function updateLightbox() {
      var item = items[activeIndex];
      var mediaWrap = _lb.querySelector('[data-lightbox-media]');
      var productPane = _lb.querySelector('[data-lightbox-product]');
      var overlayTitle = '<div class="crsl-lb__overlay">' +
          '<div class="crsl-lb__overlay-top">' +
            '<span class="crsl-lb__title">Powered by Vinci Shoppable Videos</span>' +
            '<div class="crsl-lb__top-actions">' +
              '<button type="button" class="crsl-lb__btn crsl-lb__mute-btn" aria-label="Toggle sound">' +
                '<svg class="crsl-icon-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:' + (isMuted ? '' : 'none') + '"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>' +
                '<svg class="crsl-icon-on" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="display:' + (isMuted ? 'none' : '') + '"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' +
              '</button>' +
              '<button type="button" class="crsl-lb__btn crsl-lb__close-btn" aria-label="Fechar">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>';

      mediaWrap.innerHTML = renderMedia(item) + overlayTitle;
      productPane.innerHTML = renderProductPane(item).replace(/^(<aside[^>]*>)([\s\S]*)(<\/aside>)$/, '$2');

      if (item.linkedProduct) {
        var descContainer = productPane.querySelector('[data-product-desc]');
        var initialPreview = getDescriptionPreview(item.linkedProduct.description || '', 240);
        renderDescription(descContainer, initialPreview, item.linkedProduct.url || '/collections/all');
        if (!initialPreview && item.linkedProduct.handle) {
          hydrateProductDescription(item.linkedProduct.handle, item.linkedProduct.url || ('/products/' + item.linkedProduct.handle), descContainer);
        }
      }

      if (item.id && !trackedPlayByVideo[item.id]) {
        trackedPlayByVideo[item.id] = true;
        sendTrackEvent(root, item, 'play');
      }

      var vid = _lb.querySelector('.crsl-lb__video');
      if (vid && vid.tagName === 'VIDEO') {
        vid.muted = isMuted;
        vid.play().catch(function () {});
      }
    }

    _lb = document.createElement('div');
    _lb.className = 'crsl-lb';
    _lb.setAttribute('role', 'dialog');
    _lb.setAttribute('aria-modal', 'true');
    _lb.innerHTML =
      '<div class="crsl-lb__backdrop"></div>' +
      '<div class="crsl-lb__frame">' +
        '<div class="crsl-lb__media-wrap" data-lightbox-media></div>' +
        '<aside class="crsl-lb__product-pane" data-lightbox-product></aside>' +
      '</div>';

    document.body.appendChild(_lb);

    _lb.addEventListener('click', function (event) {
      if (event.target.closest('.crsl-lb__close-btn') || event.target.closest('.crsl-lb__backdrop')) {
        closeLightbox();
        return;
      }

      if (event.target.closest('.crsl-lb__mute-btn')) {
        isMuted = !isMuted;
        var vid = _lb.querySelector('.crsl-lb__video');
        if (vid && vid.tagName === 'VIDEO') {
          vid.muted = isMuted;
        }
        updateLightbox();
      }

      var shopBtn = event.target.closest('.crsl-lb__shop-btn');
      if (shopBtn) {
        var currentItem = items[activeIndex];
        var productId = currentItem && currentItem.linkedProduct ? currentItem.linkedProduct.id : null;
        sendTrackEvent(root, currentItem, 'tag_tap', { productId: productId });
      }
    });

    var addBtn = null;
    _lb.addEventListener('click', function (event) {
      var button = event.target.closest('.crsl-lb__add-btn');
      if (!button) return;
      event.preventDefault();
      addBtn = button;
      var handle = addBtn.dataset.handle;
      if (!handle) return;
      addBtn.disabled = true;
      addBtn.textContent = 'ADDING...';
      fetch('/products/' + encodeURIComponent(handle) + '.js')
        .then(function (productRes) { return productRes.json(); })
        .then(function (productData) {
          var variantId = productData && productData.variants && productData.variants[0] && productData.variants[0].id;
          if (!variantId) throw new Error('No purchasable variant found');
          return fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: variantId, quantity: 1 })
          });
        })
        .then(function (cartRes) {
          if (!cartRes.ok) throw new Error('Failed to add to cart');
          addBtn.textContent = 'ADDED';
          var currentItem = items[activeIndex];
          var productId = currentItem && currentItem.linkedProduct ? currentItem.linkedProduct.id : null;
          sendTrackEvent(root, currentItem, 'add_to_cart', { productId: productId });
        })
        .catch(function () {
          addBtn.textContent = 'TRY AGAIN';
          setTimeout(function () {
            addBtn.textContent = 'ADD TO CART';
            addBtn.disabled = false;
          }, 1000);
        });
    });

    function onKey(e) {
      if (e.key === 'Escape') { closeLightbox(); document.removeEventListener('keydown', onKey); }
    }

    document.addEventListener('keydown', onKey);
    updateLightbox();
  }

  /* ── render strip ── */
  function renderItems(root, items, heading, layout) {
    if (layout === 'layout2') {
      renderLayout2(root, items, heading);
      return;
    }

    // Layout 1: original centered focus
    renderLayout1(root, items, heading);
  }

  function renderLayout1(root, items, heading) {
    var total = items.length;
    var visibleCount = Math.min(total, 7);
    var centerSlot = Math.floor(visibleCount / 2);
    var currentCenterIndex = 0;

    function modulo(value, size) {
      return ((value % size) + size) % size;
    }

    function signedShortestDelta(from, to, size) {
      var forward = modulo(to - from, size);
      var backward = forward - size;
      return Math.abs(backward) < Math.abs(forward) ? backward : forward;
    }

    function visibleIndexes() {
      var indexes = [];
      for (var slot = 0; slot < visibleCount; slot += 1) {
        var offset = slot - centerSlot;
        indexes.push(modulo(currentCenterIndex + offset, total));
      }
      return indexes;
    }

    function renderCard(item, realIdx, slotIdx) {
      var linked = item.linkedProduct || null;
      var metaHtml = linked
        ? '<div class="crsl-card__meta">' +
            '<div class="crsl-card__meta-image-wrap">' +
              '<img class="crsl-card__meta-image" src="' + esc(linked.image || item.thumbnail || item.url || '') + '" alt="' + esc(linked.title || 'Product') + '">' +
            '</div>' +
            '<div class="crsl-card__meta-copy">' +
              '<div class="crsl-card__meta-name">' + esc(linked.title || 'Product') + '</div>' +
              '<div class="crsl-card__meta-price">' + esc(normalizePrice(linked.price || '')) + '</div>' +
            '</div>' +
          '</div>'
        : '';

      var mediaHtml = item.type === 'VIDEO'
        ? '<video class="crsl-card__media" src="' + esc(item.url || '') +
          '" poster="' + esc(item.thumbnail || '') +
          '" loop muted playsinline preload="metadata"></video>'
        : '<img class="crsl-card__media" loading="lazy" src="' +
          esc(item.thumbnail || item.url || '') + '" alt="' + esc(item.title) + '">';

      var classes = 'crsl-card' + (slotIdx === centerSlot ? ' crsl-card--active' : '');

      return (
        '<button type="button" class="' + classes + '" data-real-idx="' + realIdx + '" aria-label="' + esc(item.title) + '">' +
          mediaHtml +
          '<div class="crsl-card__play" aria-hidden="true">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
          metaHtml +
        '</button>'
      );
    }

    function syncCenterPlayback(cardsEls) {
      cardsEls.forEach(function (card) {
        var video = card.querySelector('video.crsl-card__media');
        if (!video) {
          card.classList.remove('crsl-card--playing');
          return;
        }

        var isCenter = card.classList.contains('crsl-card--active');
        if (isCenter) {
          video.muted = true;
          video.play()
            .then(function () {
              card.classList.add('crsl-card--playing');
            })
            .catch(function () {
              card.classList.remove('crsl-card--playing');
            });
        } else {
          video.pause();
          card.classList.remove('crsl-card--playing');
        }
      });
    }

    function renderFrame(animateDirection) {
      var indexes = visibleIndexes();
      var cards = indexes.map(function (realIdx, slotIdx) {
        return renderCard(items[realIdx], realIdx, slotIdx);
      }).join('');

      root.innerHTML =
        (heading ? '<h3 class="crsl-heading">' + esc(heading) + '</h3>' : '') +
        '<div class="crsl-viewport">' +
          '<div class="crsl-track">' + cards + '</div>' +
        '</div>' +
        '<div class="crsl-controls" aria-label="Carousel controls">' +
          '<button type="button" class="crsl-controls__btn crsl-controls__btn--prev" aria-label="Previous slide">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
          '</button>' +
          '<button type="button" class="crsl-controls__btn crsl-controls__btn--next" aria-label="Next slide">' +
            '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
          '</button>' +
        '</div>';

      var cardsEls = Array.prototype.slice.call(root.querySelectorAll('.crsl-card'));
      var prevBtn = root.querySelector('.crsl-controls__btn--prev');
      var nextBtn = root.querySelector('.crsl-controls__btn--next');

      if (animateDirection) {
        var animClass = animateDirection > 0 ? 'crsl-card--anim-next' : 'crsl-card--anim-prev';
        cardsEls.forEach(function (card) {
          card.classList.add(animClass);
        });
        root.offsetWidth;
        requestAnimationFrame(function () {
          cardsEls.forEach(function (card) {
            card.classList.remove(animClass);
          });
        });
      }

      prevBtn.addEventListener('click', function () {
        currentCenterIndex = modulo(currentCenterIndex - 1, total);
        renderFrame(-1);
      });

      nextBtn.addEventListener('click', function () {
        currentCenterIndex = modulo(currentCenterIndex + 1, total);
        renderFrame(1);
      });

      cardsEls.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var realIdx = parseInt(btn.dataset.realIdx, 10);
          if (realIdx !== currentCenterIndex) {
            var direction = signedShortestDelta(currentCenterIndex, realIdx, total);
            currentCenterIndex = realIdx;
            renderFrame(direction >= 0 ? 1 : -1);
            return;
          }
          openLightbox(root, items, realIdx);
        });
      });

      syncCenterPlayback(cardsEls);
    }

    renderFrame(0);
  }

  function renderLayout2(root, items, heading) {
    var total = items.length;

    function renderCard(item, realIdx) {
      var linked = item.linkedProduct || null;
      var metaHtml = linked
        ? '<div class="crsl-card__meta">' +
            '<div class="crsl-card__meta-image-wrap">' +
              '<img class="crsl-card__meta-image" src="' + esc(linked.image || item.thumbnail || item.url || '') + '" alt="' + esc(linked.title || 'Product') + '">' +
            '</div>' +
            '<div class="crsl-card__meta-copy">' +
              '<div class="crsl-card__meta-name">' + esc(linked.title || 'Product') + '</div>' +
              '<div class="crsl-card__meta-price">' + esc(normalizePrice(linked.price || '')) + '</div>' +
            '</div>' +
          '</div>'
        : '';

      var mediaHtml = item.type === 'VIDEO'
        ? '<video class="crsl-card__media" src="' + esc(item.url || '') +
          '" poster="' + esc(item.thumbnail || '') +
          '" loop muted playsinline preload="metadata" autoplay></video>'
        : '<img class="crsl-card__media" loading="lazy" src="' +
          esc(item.thumbnail || item.url || '') + '" alt="' + esc(item.title) + '">';

      return (
        '<button type="button" class="crsl-card crsl-card--layout2" data-real-idx="' + realIdx + '" aria-label="' + esc(item.title) + '">' +
          mediaHtml +
          '<div class="crsl-card__play" aria-hidden="true">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
          metaHtml +
        '</button>'
      );
    }

    function syncAllPlayback(cardsEls) {
      cardsEls.forEach(function (card) {
        var video = card.querySelector('video.crsl-card__media');
        if (!video) {
          card.classList.remove('crsl-card--playing');
          return;
        }

        video.muted = true;
        video.play()
          .then(function () {
            card.classList.add('crsl-card--playing');
          })
          .catch(function () {
            card.classList.remove('crsl-card--playing');
          });
      });
    }

    var cards = items.map(function (item, realIdx) {
      return renderCard(item, realIdx);
    }).join('');

    root.innerHTML =
      (heading ? '<h3 class="crsl-heading">' + esc(heading) + '</h3>' : '') +
      '<div class="crsl-viewport crsl-viewport--layout2">' +
        '<div class="crsl-track crsl-track--layout2">' + cards + '</div>' +
      '</div>';

    var cardsEls = Array.prototype.slice.call(root.querySelectorAll('.crsl-card'));

    cardsEls.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var realIdx = parseInt(btn.dataset.realIdx, 10);
        openLightbox(root, items, realIdx);
      });
    });

    syncAllPlayback(cardsEls);
  }

  /* ── hydrate ── */

  async function hydrate(root) {
    if (!root || root.dataset.initialized === 'true') return;
    root.dataset.initialized = 'true';

    var endpoint  = root.dataset.endpoint;
    var source    = root.dataset.source    || 'default';
    var playlist  = root.dataset.playlist  || '';
    var playlistHandle = root.dataset.playlistHandle || '';
    var productId = root.dataset.productId || '';
    var limit     = root.dataset.limit     || '12';
    var heading   = root.dataset.heading   || '';
    var layout    = root.dataset.layout    || 'layout1';

    var headingColor          = root.dataset.headingColor          || '';
    var headingSize           = root.dataset.headingSize           || '';
    var headingFont           = root.dataset.headingFont           || '';
    var headingAlign          = root.dataset.headingAlign          || '';
    var headingMargin         = root.dataset.headingMargin         || '';
    var headingWeight         = root.dataset.headingWeight         || '';
    var headingLineHeight     = root.dataset.headingLineHeight     || '';
    var headingLetterSpacing  = root.dataset.headingLetterSpacing  || '';
    var maxWidth              = root.dataset.maxWidth              || '';
    var paddingX              = root.dataset.paddingX              || '';

    if (headingColor)         root.style.setProperty('--carrousel-heading-color', headingColor);
    if (headingSize)          root.style.setProperty('--carrousel-heading-size', headingSize);
    if (headingFont)          root.style.setProperty('--carrousel-heading-font', headingFont);
    if (headingAlign)         root.style.setProperty('--carrousel-heading-align', headingAlign);
    if (headingMargin)        root.style.setProperty('--carrousel-heading-margin', headingMargin);
    if (headingWeight)        root.style.setProperty('--carrousel-heading-weight', headingWeight);
    if (headingLineHeight)    root.style.setProperty('--carrousel-heading-line-height', headingLineHeight);
    if (headingLetterSpacing) root.style.setProperty('--carrousel-heading-letter-spacing', headingLetterSpacing);
    if (maxWidth)             root.style.setProperty('--carrousel-max-width', maxWidth);
    if (paddingX)             root.style.setProperty('--carrousel-px', paddingX);

    var url = new URL(endpoint);
    url.searchParams.set('source', source);
    url.searchParams.set('limit',  limit);
    if (playlist)  url.searchParams.set('playlist',  playlist);
    if (playlistHandle) url.searchParams.set('playlistHandle', playlistHandle);
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
        renderItems(root, payload.items, heading, layout);
      }
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