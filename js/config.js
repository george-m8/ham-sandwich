(async function () {
  try {
    const [site, support] = await Promise.all([
      window.HamUtils.fetchJson('/data/site.json'),
      window.HamUtils.fetchJson('/data/support.json')
    ]);

    const title = document.getElementById('site-name');
    if (title) {
      title.textContent = `${site.logo} ${site.name}`;
    }

    const tagline = document.getElementById('site-tagline');
    if (tagline) {
      tagline.textContent = site.tagline;
    }

    const footerYear = document.getElementById('footer-year');
    if (footerYear) {
      footerYear.textContent = site.copyright_year;
    }

    const supportContainer = document.getElementById('support-links');
    if (supportContainer) {
      const footerLinks = support.links.filter((item) => item.display.includes('footer'));
      supportContainer.innerHTML = footerLinks
        .map(
          (item) =>
            `<a class="btn-secondary" href="${window.HamUtils.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${window.HamUtils.escapeHtml(item.icon)} ${window.HamUtils.escapeHtml(item.name)}</a>`
        )
        .join('');
    }

    const supportList = document.getElementById('support-list');
    if (supportList) {
      const linksPageLinks = support.links.filter((item) => item.display.includes('links'));
      supportList.innerHTML = linksPageLinks
        .map(
          (item) =>
            `<li class="card"><a href="${window.HamUtils.escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${window.HamUtils.escapeHtml(item.icon)} ${window.HamUtils.escapeHtml(item.name)}</a></li>`
        )
        .join('');
    }
  } catch (error) {
    console.error(error);
  }
})();
