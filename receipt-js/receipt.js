(function (global) {
  const STORAGE_KEY = 'receipt-js:last-wrapper-width';

  const DEFAULT_OPTIONS = {
    containerSelector: '.site-shell, .receipt-wrapper',
    enableWidthTransition: true,
    enableHeightTransition: true,
    enableLineReveal: true,
    lineSelector: 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, code, label, legend, .card, .form-row, .output-box, .group-title, tr',
    respectReducedMotion: true,
    widthTransitionDuration: 900,
    heightTransitionDuration: 760,
    lineRevealDuration: 520,
    lineStaggerMs: 120,
    lineYOffsetPx: 6,
    containerGrowthStepDuration: 220,
    initialMaxHeightPx: 14,
    growthPaddingPx: 24,
    minWidthDelta: 6,
    minHeightDelta: 12,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    debug: false
  };

  function logDebug(options, ...args) {
    if (options.debug) {
      console.debug('[receipt-js]', ...args);
    }
  }

  function hasReducedMotionPreference(options) {
    if (!options.respectReducedMotion || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function readStoredWidth() {
    try {
      const value = window.sessionStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  function writeStoredWidth(width) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(width));
    } catch (_error) {
      return;
    }
  }

  function measureWidth(element) {
    return Math.round(element.getBoundingClientRect().width);
  }

  function measureHeight(element) {
    return Math.round(element.getBoundingClientRect().height);
  }

  function measureNaturalWidth(element) {
    const previousWidth = element.style.width;
    const previousMaxWidth = element.style.maxWidth;
    element.style.removeProperty('width');
    element.style.removeProperty('max-width');
    const width = measureWidth(element);
    if (previousWidth) {
      element.style.width = previousWidth;
    }
    if (previousMaxWidth) {
      element.style.maxWidth = previousMaxWidth;
    }
    return width;
  }

  function parseDurationMs(timeStr) {
    if (!timeStr) return 0;
    const first = timeStr.split(',')[0].trim();
    if (first.endsWith('ms')) return parseFloat(first);
    if (first.endsWith('s')) return parseFloat(first) * 1000;
    return 0;
  }

  function withAnimationFrame(callback) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(callback);
    });
  }

  function animateDimension(element, dimension, fromValue, toValue, duration, easing, done) {
    if (!Number.isFinite(fromValue) || !Number.isFinite(toValue) || fromValue === toValue) {
      if (typeof done === 'function') done();
      return;
    }

    const transition = `${dimension} ${duration}ms ${easing}`;
    element.style.willChange = dimension;
    element.style.transition = transition;
    element.style[dimension] = `${fromValue}px`;

    withAnimationFrame(() => {
      element.style[dimension] = `${toValue}px`;
    });

    window.setTimeout(() => {
      element.style.removeProperty('transition');
      element.style.removeProperty('will-change');
      element.style.removeProperty(dimension);
      if (typeof done === 'function') done();
    }, duration + 40);
  }

  function updateContainerGrowth(container, options) {
    const targetHeight = container.scrollHeight + options.growthPaddingPx;
    container.style.transitionProperty = 'max-height';
    container.style.transitionDuration = `${options.containerGrowthStepDuration}ms`;
    container.style.transitionTimingFunction = options.easing;
    container.style.maxHeight = `${targetHeight}px`;
  }

  function runLineReveal(container, options) {
    const lineTargets = options.enableLineReveal
      ? Array.from(container.querySelectorAll(options.lineSelector))
        .filter((element) => !element.closest('[data-receipt-no-reveal]'))
      : [];

    if (!lineTargets.length) {
      return 0;
    }

    container.classList.add('receipt-js-revealing');
    container.style.maxHeight = `${options.initialMaxHeightPx}px`;
    container.style.setProperty('--receipt-js-line-offset', `${options.lineYOffsetPx}px`);

    lineTargets.forEach((target) => {
      target.classList.add('receipt-js-line-pre');
    });

    lineTargets.forEach((target, index) => {
      window.setTimeout(() => {
        const targetHeight = target.scrollHeight;
        target.style.transition = `max-height ${options.lineRevealDuration}ms ${options.easing}, opacity ${options.lineRevealDuration}ms ${options.easing}, transform ${options.lineRevealDuration}ms ${options.easing}`;
        target.classList.add('receipt-js-line-show');
        target.style.maxHeight = `${Math.max(10, targetHeight + 4)}px`;

        updateContainerGrowth(container, options);

        window.setTimeout(() => {
          target.style.removeProperty('max-height');
          target.style.removeProperty('overflow');
          target.style.removeProperty('will-change');
        }, options.lineRevealDuration + 60);
      }, index * options.lineStaggerMs);
    });

    const cleanupDelay = (lineTargets.length * options.lineStaggerMs) + options.lineRevealDuration;

    window.setTimeout(() => {
      lineTargets.forEach((target) => {
        target.style.removeProperty('transition');
        target.style.removeProperty('max-height');
        target.classList.remove('receipt-js-line-pre');
        target.classList.remove('receipt-js-line-show');
      });

      container.classList.remove('receipt-js-revealing');
      container.style.removeProperty('max-height');
      container.style.removeProperty('transition');
      container.style.removeProperty('transition-property');
      container.style.removeProperty('transition-duration');
      container.style.removeProperty('transition-timing-function');
      container.style.removeProperty('--receipt-js-line-offset');
    }, cleanupDelay + 120);

    return cleanupDelay + 120;
  }

  function init(userOptions) {
    const options = { ...DEFAULT_OPTIONS, ...(userOptions || {}) };
    const container = document.querySelector(options.containerSelector);

    if (!container) {
      logDebug(options, 'No container found for selector:', options.containerSelector);
      return null;
    }

    const reducedMotion = hasReducedMotionPreference(options);
    let lastMeasuredWidth = measureWidth(container);
    let lastMeasuredHeight = measureHeight(container);
    let widthAnimationActive = false;
    let heightAnimationActive = false;
    let widthResizeTimer = null;
    let heightObserver = null;
    let revealActive = false;

    function persistCurrentWidthOnLinkNavigation(event) {
      const anchor = event.target.closest('a[href]');
      if (!anchor) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      if (nextUrl.origin === window.location.origin && anchor.target !== '_blank') {
        persistCurrentWidth();
      }
    }

    function persistCurrentWidth() {
      writeStoredWidth(measureWidth(container));
    }

    function animateInitialWidthFromPreviousPage() {
      if (reducedMotion || !options.enableWidthTransition) {
        container.style.removeProperty('width');
        container.style.removeProperty('max-width');
        persistCurrentWidth();
        return 0;
      }

      const previousWidth = readStoredWidth();
      const targetWidth = measureNaturalWidth(container);

      if (!previousWidth || Math.abs(previousWidth - targetWidth) < options.minWidthDelta) {
        container.style.removeProperty('width');
        container.style.removeProperty('max-width');
        persistCurrentWidth();
        try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (_error) {}
        return 0;
      }

      widthAnimationActive = true;

      container.style.transition = 'none';
      container.style.maxWidth = `${previousWidth}px`;
      container.offsetHeight;

      const holdMs = 40;
      window.setTimeout(() => {
        container.style.transitionProperty = 'max-width';
        container.style.transitionDuration = `${options.widthTransitionDuration}ms`;
        container.style.transitionTimingFunction = options.easing;

        window.requestAnimationFrame(() => {
          container.style.maxWidth = `${targetWidth}px`;
        });

        const computedMs = parseDurationMs(getComputedStyle(container).transitionDuration) || options.widthTransitionDuration;
        window.setTimeout(() => {
          container.style.removeProperty('max-width');
          container.style.removeProperty('transition');
          container.style.removeProperty('transition-property');
          container.style.removeProperty('transition-duration');
          container.style.removeProperty('transition-timing-function');
          widthAnimationActive = false;
          lastMeasuredWidth = measureWidth(container);
          persistCurrentWidth();
          try { window.sessionStorage.removeItem(STORAGE_KEY); } catch (_error) {}
        }, computedMs + 25);
      }, holdMs);

      return holdMs + options.widthTransitionDuration;
    }

    function handleWindowResize() {
      if (!options.enableWidthTransition || reducedMotion || widthAnimationActive) {
        return;
      }

      window.clearTimeout(widthResizeTimer);
      widthResizeTimer = window.setTimeout(() => {
        const currentWidth = measureWidth(container);
        const delta = Math.abs(currentWidth - lastMeasuredWidth);

        if (delta < options.minWidthDelta) {
          return;
        }

        widthAnimationActive = true;
        animateDimension(
          container,
          'width',
          lastMeasuredWidth,
          currentWidth,
          options.widthTransitionDuration,
          options.easing,
          () => {
            widthAnimationActive = false;
            lastMeasuredWidth = measureWidth(container);
            persistCurrentWidth();
          }
        );
      }, 100);
    }

    function setupHeightObserver() {
      if (!options.enableHeightTransition || reducedMotion || typeof ResizeObserver !== 'function') {
        return;
      }

      heightObserver = new ResizeObserver(() => {
        if (heightAnimationActive) {
          return;
        }

        const nextHeight = measureHeight(container);
        const delta = Math.abs(nextHeight - lastMeasuredHeight);
        if (delta < options.minHeightDelta || revealActive || container.classList.contains('receipt-js-revealing')) {
          return;
        }

        heightAnimationActive = true;
        animateDimension(
          container,
          'height',
          lastMeasuredHeight,
          nextHeight,
          options.heightTransitionDuration,
          options.easing,
          () => {
            heightAnimationActive = false;
            lastMeasuredHeight = measureHeight(container);
          }
        );
      });

      heightObserver.observe(container);
    }

    const initialWidthDuration = animateInitialWidthFromPreviousPage();

    const revealTargetsCount = (!reducedMotion && options.enableLineReveal)
      ? Array.from(container.querySelectorAll(options.lineSelector))
        .filter((element) => !element.closest('[data-receipt-no-reveal]')).length
      : 0;
    const expectedRevealWindow = revealTargetsCount > 0
      ? (revealTargetsCount * options.lineStaggerMs) + options.lineRevealDuration + 140
      : 0;

    if (!reducedMotion && options.enableLineReveal) {
      revealActive = true;
      window.setTimeout(() => {
        const lineRevealDuration = runLineReveal(container, options);

        window.setTimeout(() => {
          revealActive = false;
        }, lineRevealDuration + 20);
      }, Math.max(0, initialWidthDuration));
    }

    window.setTimeout(() => {
      setupHeightObserver();
    }, initialWidthDuration + expectedRevealWindow);

    window.addEventListener('resize', handleWindowResize, { passive: true });
    window.addEventListener('pagehide', persistCurrentWidth);
    document.addEventListener('click', persistCurrentWidthOnLinkNavigation, true);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        persistCurrentWidth();
      }
    });

    persistCurrentWidth();

    return {
      destroy() {
        window.removeEventListener('resize', handleWindowResize);
        window.removeEventListener('pagehide', persistCurrentWidth);
        document.removeEventListener('click', persistCurrentWidthOnLinkNavigation, true);
        if (heightObserver) {
          heightObserver.disconnect();
        }
      }
    };
  }

  global.ReceiptJS = {
    init,
    defaults: { ...DEFAULT_OPTIONS }
  };
})(window);
