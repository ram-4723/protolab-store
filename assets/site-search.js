(() => {
  const trigger = document.getElementById('searchBtn');
  const data = document.getElementById('componentData');
  if (!trigger || !data) return;

  let products = [];
  try { products = JSON.parse(data.textContent); } catch { return; }

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const dialog = document.createElement('dialog');
  dialog.className = 'search-dialog';
  dialog.setAttribute('aria-label', 'Search ProtoLab components');
  dialog.innerHTML = `
    <div class="search-panel-head">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/></svg>
      <input class="search-input" type="search" placeholder="Search parts, sensors, boards…" aria-label="Search components" autocomplete="off" spellcheck="false">
      <kbd class="search-esc">ESC</kbd>
    </div>
    <div class="search-results" aria-label="Component search results"><p class="search-hint">Search by component, category, or what you’re building.</p></div>
    <div class="search-dialog-foot">Browse the ProtoLab parts shelf</div>`;
  document.body.append(dialog);

  const input = dialog.querySelector('.search-input');
  const results = dialog.querySelector('.search-results');
  const normalized = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  function render(query) {
    const terms = normalized(query).split(/\s+/).filter(Boolean);
    if (!terms.length) {
      results.innerHTML = '<p class="search-hint">Search by component, category, or what you’re building.</p>';
      return;
    }
    const matches = products.map(product => {
      const name = normalized(product.name);
      const category = normalized(product.category);
      const searchable = normalized([
        product.name, product.category, product.summary,
        ...(product.goodFor || []), ...(product.cardChips || []),
        ...(product.specs || []).flatMap(spec => [spec.label, spec.value]),
      ].join(' '));
      const matched = terms.every(term => searchable.includes(term));
      const score = (name === normalized(query) ? 100 : name.startsWith(normalized(query)) ? 45 : 0)
        + terms.reduce((sum, term) => sum + (name.includes(term) ? 8 : category.includes(term) ? 4 : 1), 0);
      return { product, matched, score };
    }).filter(result => result.matched).sort((a, b) => b.score - a.score).slice(0, 8);

    if (!matches.length) {
      results.innerHTML = '<p class="search-hint">No components found. Try a shorter name or another category.</p>';
      return;
    }
    results.innerHTML = matches.map(({ product }) => `
      <a class="search-result" href="product.html?slug=${encodeURIComponent(product.slug)}">
        <img src="${escapeHTML(product.image)}" alt="" loading="lazy">
        <span class="search-result-copy">
          <span class="search-result-category">${escapeHTML(product.category)}</span>
          <span class="search-result-name">${escapeHTML(product.name)}</span>
          <span class="search-result-summary">${escapeHTML(product.summary)}</span>
        </span>
        <span class="search-result-price">${product.price == null ? 'Ask' : `₹${Number(product.price).toLocaleString('en-IN')}`}</span>
      </a>`).join('');
    results.querySelectorAll('img').forEach(image => image.addEventListener('error', () => image.remove(), { once: true }));
  }

  trigger.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
    input.value = '';
    render('');
    requestAnimationFrame(() => input.focus());
  });
  input.addEventListener('input', () => render(input.value));
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if ((event.key === '/' && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
      event.preventDefault();
      if (!dialog.open) trigger.click();
    }
  });
})();
