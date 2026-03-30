(function () {
  const RECEIPT_STORAGE_KEY = 'receipt-js:last-wrapper-width';

  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', () => {
      links.classList.toggle('open');
    });
  }

  const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
  const navLinks = document.querySelectorAll('#nav-links a');
  navLinks.forEach((link) => {
    const linkPath = new URL(link.href).pathname.replace(/\/$/, '') || '/';
    if (currentPath === linkPath || (currentPath.startsWith(linkPath) && linkPath !== '/')) {
      link.classList.add('active');
    }
  });

  function prewarmReceiptWidth() {
    const container = document.querySelector('.site-shell, .receipt-wrapper');
    if (!container) {
      return;
    }

    try {
      const raw = window.sessionStorage.getItem(RECEIPT_STORAGE_KEY);
      const previousWidth = Number(raw);
      if (Number.isFinite(previousWidth) && previousWidth > 0) {
        container.style.maxWidth = `${previousWidth}px`;
      }
    } catch (_error) {
      return;
    }
  }

  async function getReceiptConfig() {
    if (!window.ReceiptJS || typeof window.ReceiptJS.init !== 'function') {
      return null;
    }

    const defaultConfig = {
      containerSelector: '.site-shell, .receipt-wrapper',
      enableWidthTransition: true,
      enableHeightTransition: true,
      enableLineReveal: false,
      lineSelector: 'h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, pre, code, label, legend, .card, .form-row, .output-box, .group-title, tr',
      widthTransitionDuration: 900,
      heightTransitionDuration: 760,
      lineRevealDuration: 520,
      lineStaggerMs: 120,
      lineYOffsetPx: 6,
      containerGrowthStepDuration: 220,
      initialMaxHeightPx: 14,
      growthPaddingPx: 24,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      minWidthDelta: 6,
      minHeightDelta: 12,
      debug: false
    };

    let fileConfig = {};
    try {
      const response = await fetch('/data/receipt-js.json', { cache: 'no-store' });
      if (response.ok) {
        fileConfig = await response.json();
      }
    } catch (_error) {
      fileConfig = {};
    }

    const userConfig = window.HamReceiptConfig || {};
    return { ...defaultConfig, ...fileConfig, ...userConfig };
  }

  async function initReceiptJs() {
    const config = await getReceiptConfig();
    if (!config) {
      return;
    }

    window.ReceiptJS.init(config);
  }

  function ensureReceiptJsLoaded() {
    if (window.ReceiptJS) {
      void initReceiptJs();
      return;
    }

    const script = document.createElement('script');
    script.src = '/receipt-js/receipt.js';
    script.onload = () => {
      void initReceiptJs();
    };
    document.head.appendChild(script);
  }

  prewarmReceiptWidth();
  ensureReceiptJsLoaded();
})();
