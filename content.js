(function () {
  'use strict';

  const POPUP_TEXT = 'this section is not available anymore';
  const ALT_POPUP_TEXT = 'please use the main exam page';

  let busy = false;
  let throttle = 0;

  function restoreScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el) continue;
      el.classList.remove('modal-open');
      if (el.style.overflow === 'hidden') el.style.removeProperty('overflow');
      if (el.style.paddingRight) el.style.removeProperty('padding-right');
    }
  }

  function findPopupByText() {
    const all = document.querySelectorAll('div, section, aside, dialog');
    for (const el of all) {
      const text = (el.textContent || '').trim().toLowerCase();
      if (!text || text.length > 600) continue;
      if (text.includes(POPUP_TEXT) || text.includes(ALT_POPUP_TEXT)) {
        return el.closest('.modal, [role="dialog"], [class*="modal"]') || el;
      }
    }
    return null;
  }

  function hideElement(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.setAttribute('data-killed-by-popup-killer', '1');
  }

  function cleanup() {
    if (busy) return;
    busy = true;
    try {
      const popup = findPopupByText();
      if (popup && !popup.hasAttribute('data-killed-by-popup-killer')) {
        hideElement(popup);
        document.querySelectorAll('.modal-backdrop').forEach(hideElement);
        restoreScroll();
      } else {
        restoreScroll();
      }
    } catch (_) {} finally {
      busy = false;
    }
  }

  function scheduleCleanup() {
    if (throttle) return;
    throttle = setTimeout(() => {
      throttle = 0;
      cleanup();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanup, { once: true });
  } else {
    cleanup();
  }
  window.addEventListener('load', cleanup, { once: true });

  const observer = new MutationObserver(scheduleCleanup);
  const startObserver = () => {
    if (!document.body) return false;
    observer.observe(document.body, { childList: true, subtree: true });
    return true;
  };

  if (!startObserver()) {
    const ready = new MutationObserver(() => {
      if (startObserver()) ready.disconnect();
    });
    ready.observe(document.documentElement, { childList: true, subtree: true });
  }

  const VIEW_URL_REGEX = /^(https?:\/\/[^/]+\/discussions\/[^/]+\/view\/)(\d+)(-[^/]*\/?)/i;

  function parseViewUrl(href) {
    const match = href.match(VIEW_URL_REGEX);
    if (!match) return null;
    return { prefix: match[1], number: parseInt(match[2], 10), suffix: match[3] };
  }

  function buildUrl(parts, delta) {
    const next = parts.number + delta;
    if (next < 1) return null;
    return parts.prefix + next + parts.suffix;
  }

  function injectNavButtons() {
    if (window.self !== window.top) return;
    if (document.getElementById('etk-nav-wrapper')) return;
    const parts = parseViewUrl(window.location.href);
    if (!parts) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'etk-nav-wrapper';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.id = 'etk-nav-prev';
    prev.className = 'etk-nav-btn';
    prev.textContent = '◀ Prev';
    prev.title = 'Câu trước (' + (parts.number - 1) + ')';

    const next = document.createElement('button');
    next.type = 'button';
    next.id = 'etk-nav-next';
    next.className = 'etk-nav-btn';
    next.textContent = 'Next ▶';
    next.title = 'Câu sau (' + (parts.number + 1) + ')';

    prev.addEventListener('click', () => {
      const url = buildUrl(parts, -1);
      if (url) window.location.href = url;
    });
    next.addEventListener('click', () => {
      const url = buildUrl(parts, 1);
      if (url) window.location.href = url;
    });

    if (parts.number <= 1) prev.disabled = true;

    wrapper.appendChild(prev);
    wrapper.appendChild(next);
    (document.body || document.documentElement).appendChild(wrapper);
  }

  function tryInjectNav() {
    if (document.body) {
      injectNavButtons();
    } else {
      document.addEventListener('DOMContentLoaded', injectNavButtons, { once: true });
    }
  }
  tryInjectNav();
})();
