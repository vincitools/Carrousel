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

  function getDescriptionParagraphs(value) {
    var text = stripHtml(String(value || '').replace(/\r/g, '\n'));
    if (!text) return [];

    var blocks = text
      .split(/\n{2,}/)
      .map(function (part) { return part.trim(); })
      .filter(Boolean);

    if (blocks.length >= 2) return blocks.slice(0, 2);
    if (blocks.length === 1) {
      var splitBySentence = splitSentences(blocks[0]);

      if (splitBySentence.length >= 2) {
        return [splitBySentence[0], splitBySentence[1]];
      }
    }

    return blocks.slice(0, 1);
  }

  function renderDescription(container, paragraphs) {
    if (!container) return;
    container.innerHTML = (paragraphs || []).map(function (paragraph) {
      return '<p class="crsl-lb__product-desc-p">' + esc(paragraph) + '</p>';
    }).join('');
    container.style.display = (paragraphs && paragraphs.length > 0) ? '' : 'none';
  }

  async function hydrateProductDescription(handle, container) {
    if (!handle || !container) return;
    try {
      var response = await fetch('/products/' + encodeURIComponent(handle) + '.js');
      if (!response.ok) return;
      var payload = await response.json();
      var source = payload && (payload.description || payload.body_html || payload.bodyHtml || '');
      var paragraphs = getDescriptionParagraphs(source);
      renderDescription(container, paragraphs);
    } catch (_) {
      // Keep modal clean even if product endpoint is unavailable.
    }
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
      var descriptionParagraphs = getDescriptionParagraphs(linked.description || '');
      var descriptionHtml = '<div class="crsl-lb__product-desc" data-product-desc></div>';

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
            descriptionHtml +
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

    if (linked) {
      var descContainer = _lb.querySelector('[data-product-desc]');
      var initialParagraphs = getDescriptionParagraphs(linked.description || '');
      renderDescription(descContainer, initialParagraphs);
      if (initialParagraphs.length === 0 && linked.handle) {
        hydrateProductDescription(linked.handle, descContainer);
      }
    }

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

      return (
        '<button type="button" class="crsl-card" data-idx="' + idx + '" aria-label="' + esc(item.title) + '">' +
          mediaHtml +
          '<div class="crsl-card__play" aria-hidden="true">' +
            '<svg width="15" height="15" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>' +
          '</div>' +
          metaHtml +
        '</button>'
      );
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
    var viewport = root.querySelector('.crsl-viewport');
    var prevBtn = root.querySelector('.crsl-controls__btn--prev');
    var nextBtn = root.querySelector('.crsl-controls__btn--next');
    var currentIndex = 0;
    var scrollTimer = null;

    function syncCenterPlayback() {
      cardsEls.forEach(function (card, idx) {
        var video = card.querySelector('video.crsl-card__media');
        if (!video) return;
        if (idx === currentIndex) {
          video.muted = true;
          video.play().catch(function () {});
        } else {
          video.pause();
        }
      });
    }

    function updateActiveState(index) {
      currentIndex = index;
      cardsEls.forEach(function (card, idx) {
        card.classList.toggle('crsl-card--active', idx === currentIndex);
      });
      syncCenterPlayback();
    }

    function centerIndex(index, smooth) {
      var target = cardsEls[index];
      if (!target) return;
      updateActiveState(index);
      target.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', inline: 'center', block: 'nearest' });
    }

    function closestToCenterIndex() {
      var viewportRect = viewport.getBoundingClientRect();
      var viewportCenter = viewportRect.left + viewportRect.width / 2;
      var bestIdx = currentIndex;
      var bestDist = Infinity;

      cardsEls.forEach(function (card, idx) {
        var rect = card.getBoundingClientRect();
        var center = rect.left + rect.width / 2;
        var dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      return bestIdx;
    }

    prevBtn.addEventListener('click', function () {
      var nextIndex = (currentIndex - 1 + cardsEls.length) % cardsEls.length;
      centerIndex(nextIndex, true);
    });

    nextBtn.addEventListener('click', function () {
      var nextIndex = (currentIndex + 1) % cardsEls.length;
      centerIndex(nextIndex, true);
    });

    viewport.addEventListener('scroll', function () {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () {
        updateActiveState(closestToCenterIndex());
      }, 80);
    }, { passive: true });

    /* click → lightbox */
    cardsEls.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx, 10);
        if (idx !== currentIndex) {
          centerIndex(idx, true);
          return;
        }
        openLightbox(items[idx]);
      });
    });

    centerIndex(Math.floor(items.length / 2), false);

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () {
        centerIndex(currentIndex, false);
      });
      ro.observe(viewport);
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