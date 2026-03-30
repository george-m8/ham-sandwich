(async function () {
  const container = document.getElementById('links-groups');
  if (!container) {
    return;
  }

  try {
    const data = await window.HamUtils.fetchJson('/data/links.json');
    container.innerHTML = data.linkGroups
      .map(
        (group) => `
          <section class="link-group">
            <h3 class="group-title">${window.HamUtils.escapeHtml(group.title)}</h3>
            <ul class="list-reset link-group-list">
              ${group.links
                .map(
                  (link) =>
                    `<li class="card"><a href="${window.HamUtils.escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${window.HamUtils.escapeHtml(link.name)}</a><p class="small-text">${window.HamUtils.escapeHtml(link.description)}</p></li>`
                )
                .join('')}
            </ul>
          </section>
        `
      )
      .join('');
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p>Could not load links.</p>';
  }
})();
