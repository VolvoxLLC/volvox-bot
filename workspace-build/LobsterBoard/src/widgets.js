/**
 * LobsterBoard - Widget Definitions
 * Each widget defines its default size, properties, and generated code
 * 
 * @module lobsterboard/widgets
 */

export const WIDGETS = {
  // ─────────────────────────────────────────────
  // SMALL CARDS (KPI style)
  // ─────────────────────────────────────────────
  
  'weather': {
    name: 'Local Weather',
    icon: '🌡️',
    category: 'small',
    description: 'Shows current weather for a single location using wttr.in (no API key needed).',
    defaultWidth: 200,
    defaultHeight: 120,
    hasApiKey: false,
    properties: {
      title: 'Local Weather',
      location: 'Atlanta',
      units: 'F',
      refreshInterval: 600
    },
    preview: `<div style="text-align:center;padding:8px;">
      <div style="font-size:24px;">72°F</div>
      <div style="font-size:11px;color:#8b949e;">Atlanta</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">🌡️ ${props.title || 'Local Weather'}</span>
        </div>
        <div class="dash-card-body" style="display:flex;align-items:center;justify-content:center;gap:10px;">
          <span id="${props.id}-icon" style="font-size:24px;">🌡️</span>
          <div>
            <div class="kpi-value blue" id="${props.id}-value">—</div>
            <div class="kpi-label" id="${props.id}-label">${props.location || 'Location'}</div>
          </div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Weather Widget: ${props.id} (uses free wttr.in API - no key needed)
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const location = encodeURIComponent('${props.location || 'Atlanta'}');
          const res = await fetch('https://wttr.in/' + location + '?format=j1');
          const data = await res.json();
          const current = data.current_condition[0];
          const temp = '${props.units}' === 'C' ? current.temp_C : current.temp_F;
          const unit = '${props.units}' === 'C' ? '°C' : '°F';
          document.getElementById('${props.id}-value').textContent = temp + unit;
          document.getElementById('${props.id}-label').textContent = current.weatherDesc[0].value;
          const code = parseInt(current.weatherCode);
          let icon = '🌡️';
          if (code === 113) icon = '☀️';
          else if (code === 116 || code === 119) icon = '⛅';
          else if (code >= 176 && code <= 359) icon = '🌧️';
          else if (code >= 368 && code <= 395) icon = '❄️';
          document.getElementById('${props.id}-icon').textContent = icon;
        } catch (e) {
          console.error('Weather widget error:', e);
          document.getElementById('${props.id}-value').textContent = '—';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 600) * 1000});
    `
  },

  'clock': {
    name: 'Clock',
    icon: '🕐',
    category: 'small',
    description: 'Simple digital clock. Supports 12h or 24h format.',
    defaultWidth: 200,
    defaultHeight: 120,
    hasApiKey: false,
    properties: {
      title: 'Clock',
      timezone: 'local',
      format24h: false
    },
    preview: `<div style="text-align:center;padding:8px;">
      <div style="font-size:24px;">3:45 PM</div>
      <div style="font-size:11px;color:#8b949e;">Wed, Feb 5</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">🕐 ${props.title || 'Clock'}</span>
        </div>
        <div class="dash-card-body" style="display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div class="kpi-value" id="${props.id}-time">—</div>
          <div class="kpi-label" id="${props.id}-date">—</div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Clock Widget: ${props.id}
      function updateClock_${props.id.replace(/-/g, '_')}() {
        const now = new Date();
        const timeEl = document.getElementById('${props.id}-time');
        const dateEl = document.getElementById('${props.id}-date');
        const opts = { hour: 'numeric', minute: '2-digit', hour12: ${!props.format24h} };
        timeEl.textContent = now.toLocaleTimeString('en-US', opts);
        dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      }
      updateClock_${props.id.replace(/-/g, '_')}();
      setInterval(updateClock_${props.id.replace(/-/g, '_')}, 1000);
    `
  },

  'auth-status': {
    name: 'Auth Status',
    icon: '🔐',
    category: 'small',
    description: 'Shows if OpenClaw is using Anthropic Max subscription (green) or API key fallback (yellow).',
    defaultWidth: 180,
    defaultHeight: 100,
    hasApiKey: true,
    apiKeyName: 'OPENCLAW_API',
    properties: {
      title: 'Auth Type',
      endpoint: '/api/status',
      refreshInterval: 30
    },
    preview: `<div style="text-align:center;padding:8px;">
      <div style="width:10px;height:10px;background:#3fb950;border-radius:50%;margin:0 auto 4px;"></div>
      <div style="font-size:13px;">OAuth</div>
      <div style="font-size:11px;color:#8b949e;">Auth</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">🔐 ${props.title || 'Auth Type'}</span>
        </div>
        <div class="dash-card-body" style="display:flex;align-items:center;justify-content:center;gap:10px;">
          <div class="kpi-indicator" id="${props.id}-dot"></div>
          <div class="kpi-value" id="${props.id}-value">—</div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Auth Status Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('${props.endpoint || '/api/status'}');
          const json = await res.json();
          const data = json.data || json;
          const dot = document.getElementById('${props.id}-dot');
          const val = document.getElementById('${props.id}-value');
          val.textContent = data.authMode === 'oauth' ? 'Subscription' : 'API';
          dot.className = 'kpi-indicator ' + (data.authMode === 'oauth' ? 'green' : 'yellow');
        } catch (e) {
          console.error('Auth status widget error:', e);
          document.getElementById('${props.id}-value').textContent = '—';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 30) * 1000});
    `
  },

  'session-count': {
    name: 'Active Sessions',
    icon: '💬',
    category: 'small',
    description: 'Shows count of active OpenClaw sessions.',
    defaultWidth: 160,
    defaultHeight: 100,
    hasApiKey: true,
    apiKeyName: 'OPENCLAW_API',
    properties: {
      title: 'Sessions',
      endpoint: '/api/sessions',
      refreshInterval: 30
    },
    preview: `<div style="text-align:center;padding:8px;">
      <div style="font-size:28px;color:#58a6ff;">3</div>
      <div style="font-size:11px;color:#8b949e;">Active</div>
    </div>`,
    generateHtml: (props) => `
      <div class="kpi-card kpi-sm" id="widget-${props.id}">
        <div class="kpi-icon">💬</div>
        <div class="kpi-data">
          <div class="kpi-value blue" id="${props.id}-count">—</div>
          <div class="kpi-label">Active</div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Session Count Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('${props.endpoint || '/api/sessions'}');
          const json = await res.json();
          const data = json.data || json;
          document.getElementById('${props.id}-count').textContent = data.active || data.length || 0;
        } catch (e) {
          document.getElementById('${props.id}-count').textContent = '—';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 30) * 1000});
    `
  },

  // ─────────────────────────────────────────────
  // LARGE CARDS (Content)
  // ─────────────────────────────────────────────

  'activity-list': {
    name: 'Activity List',
    icon: '📋',
    category: 'large',
    description: 'Shows recent OpenClaw activity from /api/activity endpoint.',
    defaultWidth: 400,
    defaultHeight: 300,
    hasApiKey: true,
    apiKeyName: 'OPENCLAW_API',
    properties: {
      title: 'Today',
      endpoint: '/api/activity',
      maxItems: 10,
      refreshInterval: 60
    },
    preview: `<div style="padding:4px;font-size:11px;color:#8b949e;">
      <div>• Meeting at 2pm</div>
      <div>• Review PR #42</div>
      <div>• Deploy v1.2</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">📋 ${props.title || 'Today'}</span>
          <span class="dash-card-badge" id="${props.id}-badge">—</span>
        </div>
        <div class="dash-card-body compact-list" id="${props.id}-list">
          <div class="list-item">• Team standup at 10am</div>
          <div class="list-item">• Review PR #42</div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Activity List Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('${props.endpoint || '/api/activity'}');
          const json = await res.json();
          const data = json.data || json;
          const list = document.getElementById('${props.id}-list');
          const badge = document.getElementById('${props.id}-badge');
          const items = data.items || [];
          list.innerHTML = items.slice(0, ${props.maxItems || 10}).map(item => 
            '<div class="list-item">' + item.text + '</div>'
          ).join('');
          badge.textContent = items.length + ' items';
        } catch (e) {
          console.error('Activity list widget error:', e);
          document.getElementById('${props.id}-list').innerHTML = '<div class="list-item">—</div>';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 60) * 1000});
    `
  },

  'cron-jobs': {
    name: 'Cron Jobs',
    icon: '⏰',
    category: 'large',
    description: 'Lists scheduled cron jobs from OpenClaw /api/cron endpoint.',
    defaultWidth: 400,
    defaultHeight: 250,
    hasApiKey: true,
    apiKeyName: 'OPENCLAW_API',
    properties: {
      title: 'Cron',
      endpoint: '/api/cron',
      refreshInterval: 30
    },
    preview: `<div style="padding:4px;font-size:11px;color:#8b949e;">
      <div>⏰ Daily backup - 2am</div>
      <div>⏰ Sync data - */5 *</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">⏰ ${props.title || 'Cron'}</span>
          <span class="dash-card-badge" id="${props.id}-badge">—</span>
        </div>
        <div class="dash-card-body" id="${props.id}-list">
          <div class="cron-item"><span class="cron-name">Daily backup</span><span class="cron-next">2:00 AM</span></div>
        </div>
      </div>`,
    generateJs: (props) => `
      // Cron Jobs Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('${props.endpoint || '/api/cron'}');
          const json = await res.json();
          const data = json.data || json;
          const list = document.getElementById('${props.id}-list');
          const badge = document.getElementById('${props.id}-badge');
          const jobs = data.jobs || [];
          list.innerHTML = jobs.map(job => 
            '<div class="cron-item"><span class="cron-name">' + job.name + '</span><span class="cron-next">' + job.next + '</span></div>'
          ).join('');
          badge.textContent = jobs.length + ' jobs';
        } catch (e) {
          console.error('Cron jobs widget error:', e);
          document.getElementById('${props.id}-list').innerHTML = '<div class="cron-item"><span class="cron-name">—</span></div>';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 30) * 1000});
    `
  },

  'system-log': {
    name: 'System Log',
    icon: '🔧',
    category: 'large',
    description: 'Shows recent system logs from OpenClaw /api/logs endpoint.',
    defaultWidth: 500,
    defaultHeight: 400,
    hasApiKey: true,
    apiKeyName: 'OPENCLAW_API',
    properties: {
      title: 'System Log',
      endpoint: '/api/logs',
      maxLines: 50,
      refreshInterval: 10
    },
    preview: `<div style="padding:4px;font-size:10px;font-family:monospace;color:#8b949e;">
      <div>[INFO] System started</div>
      <div>[DEBUG] Loading config</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">🔧 ${props.title || 'System Log'}</span>
          <span class="dash-card-badge" id="${props.id}-badge">—</span>
        </div>
        <div class="dash-card-body compact-list syslog-scroll" id="${props.id}-log">
          <div class="log-line">[INFO] System started successfully</div>
        </div>
      </div>`,
    generateJs: (props) => `
      // System Log Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('${props.endpoint || '/api/logs'}');
          const json = await res.json();
          const data = json.data || json;
          const log = document.getElementById('${props.id}-log');
          const badge = document.getElementById('${props.id}-badge');
          const lines = data.lines || [];
          log.innerHTML = lines.slice(-${props.maxLines || 50}).map(line => 
            '<div class="log-line">' + line + '</div>'
          ).join('');
          badge.textContent = lines.length + ' lines';
          log.scrollTop = log.scrollHeight;
        } catch (e) {
          console.error('System log widget error:', e);
          document.getElementById('${props.id}-log').innerHTML = '<div class="log-line">—</div>';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 10) * 1000});
    `
  },

  // ─────────────────────────────────────────────
  // BARS
  // ─────────────────────────────────────────────

  'pages-menu': {
    name: 'Pages Menu',
    icon: '📑',
    category: 'small',
    description: 'Navigation links to all discovered LobsterBoard pages. Supports vertical or horizontal layout.',
    defaultWidth: 220,
    defaultHeight: 200,
    hasApiKey: false,
    properties: {
      title: 'Pages',
      layout: 'vertical',
      refreshInterval: 60
    },
    preview: `<div style="padding:6px;font-size:11px;color:#8b949e;">
      <div>📝 Notes</div>
      <div>📋 Board</div>
      <div>📅 Calendar</div>
    </div>`,
    generateHtml: (props) => `
      <div class="dash-card" id="widget-${props.id}" style="height:100%;">
        <div class="dash-card-head">
          <span class="dash-card-title">📑 ${props.title || 'Pages'}</span>
        </div>
        <div class="dash-card-body pages-menu ${props.layout === 'horizontal' ? 'pages-menu-horizontal' : 'pages-menu-vertical'}" id="${props.id}-list">
          <span class="pages-menu-item">Loading…</span>
        </div>
      </div>
      <style>
        .pages-menu-vertical { display:flex; flex-direction:column; gap:4px; overflow-y:auto; }
        .pages-menu-horizontal { display:flex; flex-direction:row; flex-wrap:wrap; gap:6px; align-items:center; }
        .pages-menu-item {
          display:inline-flex; align-items:center; gap:6px;
          padding:6px 10px; border-radius:6px;
          background:#21262d; color:#c9d1d9;
          text-decoration:none; font-size:13px;
          transition: background .15s, color .15s;
        }
        .pages-menu-item:hover { background:#30363d; color:#58a6ff; }
        .pages-menu-item .pages-menu-icon { font-size:15px; }
      </style>`,
    generateJs: (props) => `
      // Pages Menu Widget: ${props.id}
      async function update_${props.id.replace(/-/g, '_')}() {
        try {
          const res = await fetch('/api/pages');
          const pages = await res.json();
          const list = document.getElementById('${props.id}-list');
          if (!pages.length) { list.innerHTML = '<span class="pages-menu-item">No pages found</span>'; return; }
          list.innerHTML = pages.map(p =>
            '<a class="pages-menu-item" href="/pages/' + p.id + '" title="' + (p.description || p.title || p.name || '') + '">' +
            '<span class="pages-menu-icon">' + (p.icon || '📄') + '</span>' +
            '<span>' + (p.title || p.name || p.id) + '</span></a>'
          ).join('');
        } catch (e) {
          console.error('Pages menu widget error:', e);
          document.getElementById('${props.id}-list').innerHTML = '<span class="pages-menu-item">Error loading pages</span>';
        }
      }
      update_${props.id.replace(/-/g, '_')}();
      setInterval(update_${props.id.replace(/-/g, '_')}, ${(props.refreshInterval || 60) * 1000});
    `
  },

  'topbar': {
    name: 'Top Nav Bar',
    icon: '🔝',
    category: 'bar',
    description: 'Navigation bar with clock, weather, and system stats.',
    defaultWidth: 1920,
    defaultHeight: 48,
    hasApiKey: false,
    properties: {
      title: 'OpenClaw',
      links: 'Dashboard,Activity,Settings'
    },
    preview: `<div style="background:#161b22;padding:8px;font-size:11px;display:flex;gap:12px;">
      <span>🤖 OpenClaw</span>
      <span style="color:#58a6ff;">Dashboard</span>
    </div>`,
    generateHtml: (props) => `
      <nav class="topbar" id="widget-${props.id}">
        <div class="topbar-left">
          <span class="topbar-brand">🤖 ${props.title || 'OpenClaw'}</span>
          ${(props.links || 'Dashboard').split(',').map((link, i) => 
            `<a href="#" class="topbar-link${i === 0 ? ' active' : ''}">${link.trim()}</a>`
          ).join('')}
        </div>
        <div class="topbar-right">
          <span class="topbar-meta" id="${props.id}-refresh">—</span>
          <button class="topbar-refresh" onclick="location.reload()" title="Refresh">↻</button>
        </div>
      </nav>`,
    generateJs: (props) => `
      // Top Bar Widget: ${props.id}
      document.getElementById('${props.id}-refresh').textContent = 
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    `
  }
};

// Helper to get widget categories
export function getWidgetCategories() {
  const categories = {};
  for (const [key, widget] of Object.entries(WIDGETS)) {
    const cat = widget.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, ...widget });
  }
  return categories;
}

// Helper to get widget by type
export function getWidget(type) {
  return WIDGETS[type] || null;
}

// Helper to list all widget types
export function getWidgetTypes() {
  return Object.keys(WIDGETS);
}

export default WIDGETS;
