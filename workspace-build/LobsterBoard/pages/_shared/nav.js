// Shared navigation for LobsterBoard pages
// Include via <script src="/pages/_shared/nav.js"></script>
// Requires <nav id="page-nav"></nav> in the page HTML

(function() {
  const navEl = document.getElementById('page-nav');
  if (!navEl) return;

  const currentPath = window.location.pathname;

  fetch('/api/pages')
    .then(r => r.json())
    .then(pages => {
      const links = [
        { href: '/', icon: '🦞', title: 'Dashboard' }
      ].concat(pages.map(p => ({
        href: '/pages/' + p.id,
        icon: p.icon,
        title: p.title
      })));

      navEl.innerHTML = `
        <div class="lb-nav">
          <div class="lb-nav-left">
            ${links.map(l => {
              const active = l.href === currentPath || (l.href !== '/' && currentPath.startsWith(l.href));
              return `<a href="${l.href}" class="lb-nav-link${active ? ' active' : ''}">${l.icon} ${l.title}</a>`;
            }).join('')}
          </div>
        </div>
      `;
    })
    .catch(() => {
      navEl.innerHTML = `<div class="lb-nav"><div class="lb-nav-left">
        <a href="/" class="lb-nav-link">🦞 Dashboard</a>
      </div></div>`;
    });

  // Inject nav styles if not already present
  if (!document.getElementById('lb-nav-styles')) {
    const style = document.createElement('style');
    style.id = 'lb-nav-styles';
    style.textContent = `
      .lb-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #161b22;
        border-bottom: 1px solid #30363d;
        padding: 0 1rem;
        height: 42px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .lb-nav-left {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .lb-nav-link {
        color: #8b949e;
        text-decoration: none;
        font-size: 13px;
        font-weight: 500;
        padding: 6px 10px;
        border-radius: 6px;
        transition: color 0.15s, background 0.15s;
      }
      .lb-nav-link:hover {
        color: #e6edf3;
        background: #21262d;
      }
      .lb-nav-link.active {
        color: #e6edf3;
        background: #30363d;
      }
    `;
    document.head.appendChild(style);
  }
})();
