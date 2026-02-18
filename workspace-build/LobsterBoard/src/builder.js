/**
 * LobsterBoard - Dashboard Builder Core
 * Provides utilities for generating dashboard HTML, CSS, and JS
 * 
 * @module lobsterboard/builder
 */

import { WIDGETS } from './widgets.js';

// ─────────────────────────────────────────────
// SECURITY HELPERS
// ─────────────────────────────────────────────

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  // Fallback for Node.js
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─────────────────────────────────────────────
// HTML PROCESSING
// ─────────────────────────────────────────────

/**
 * Process widget HTML to conditionally remove header
 * @param {string} html - Widget HTML
 * @param {boolean} showHeader - Whether to show the header
 * @returns {string} Processed HTML
 */
export function processWidgetHtml(html, showHeader) {
  if (showHeader !== false) return html;
  const headerRegex = /<div\s+class="dash-card-head"[^>]*>[\s\S]*?<\/div>/i;
  return html.replace(headerRegex, '');
}

// ─────────────────────────────────────────────
// CSS GENERATION
// ─────────────────────────────────────────────

/**
 * Generate the base dashboard CSS
 * @returns {string} CSS styles
 */
export function generateDashboardCss() {
  return `/* LobsterBoard Dashboard - Generated Styles */

:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --bg-hover: #30363d;
  --border: #30363d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;
  --accent-blue: #58a6ff;
  --accent-green: #3fb950;
  --accent-orange: #d29922;
  --accent-red: #f85149;
  --accent-purple: #a371f7;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
}

.dashboard {
  margin: 0 auto;
  overflow: hidden;
}

.widget-container {
  overflow: hidden;
}

/* KPI Cards */
.kpi-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 100%;
}

.kpi-sm {
  padding: 12px;
}

.kpi-icon {
  font-size: 24px;
}

.kpi-data {
  flex: 1;
}

.kpi-value {
  font-size: 20px;
  font-weight: 600;
}

.kpi-value.blue { color: var(--accent-blue); }
.kpi-value.green { color: var(--accent-green); }
.kpi-value.orange { color: var(--accent-orange); }
.kpi-value.red { color: var(--accent-red); }

.kpi-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

.kpi-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
}

.kpi-indicator.green { background: var(--accent-green); }
.kpi-indicator.yellow { background: var(--accent-orange); }
.kpi-indicator.red { background: var(--accent-red); }

/* Dash Cards */
.dash-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dash-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-tertiary);
}

.dash-card-title {
  font-size: 13px;
  font-weight: 600;
}

.dash-card-badge {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 2px 8px;
  border-radius: 10px;
}

.dash-card-body {
  flex: 1;
  padding: 12px 16px;
  overflow-y: auto;
}

.compact-list {
  font-size: 12px;
}

.syslog-scroll {
  font-family: 'SF Mono', Monaco, monospace;
  font-size: 11px;
}

/* Top Bar */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  height: 100%;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.topbar-brand {
  font-weight: 600;
  font-size: 14px;
}

.topbar-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
}

.topbar-link:hover,
.topbar-link.active {
  color: var(--accent-blue);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.topbar-refresh {
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}

/* List Items */
.list-item {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.list-item:last-child {
  border-bottom: none;
}

.cron-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.cron-name {
  color: var(--text-primary);
}

.cron-next {
  color: var(--text-muted);
  font-size: 11px;
}

.log-line {
  padding: 2px 0;
  border-bottom: 1px solid rgba(48, 54, 61, 0.5);
}

/* Weather */
.weather-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.weather-row:last-child {
  border-bottom: none;
}

.weather-icon {
  font-size: 18px;
}

.weather-loc {
  flex: 1;
  color: var(--text-primary);
}

.weather-temp {
  font-weight: 600;
  color: var(--accent-blue);
}

/* Utilities */
.loading-sm {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid var(--bg-tertiary);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.error {
  color: var(--accent-red);
  padding: 10px;
  text-align: center;
}

::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: var(--bg-primary);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-tertiary);
  border-radius: 3px;
}

/* Post-Export Edit Mode */
.edit-mode .widget-container {
  cursor: move;
  outline: 2px dashed #3b82f6;
  outline-offset: -2px;
}

.edit-mode .widget-container:hover {
  outline-color: #60a5fa;
}

.edit-mode .widget-container.dragging {
  opacity: 0.8;
  z-index: 1000;
}

.resize-handle-edit {
  display: none;
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
  background: #3b82f6;
  border-radius: 2px 0 0 0;
  z-index: 10;
}

.edit-mode .resize-handle-edit {
  display: block;
}

#edit-toggle {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  padding: 8px 16px;
  background: #1e293b;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

#edit-toggle:hover {
  background: #334155;
}

#edit-toggle.active {
  background: #3b82f6;
}
`;
}

// ─────────────────────────────────────────────
// JS GENERATION
// ─────────────────────────────────────────────

/**
 * Generate the post-export edit mode JS
 * @returns {string} JavaScript code
 */
export function generateEditJs() {
  return `
// ─────────────────────────────────────────────
// POST-EXPORT LAYOUT EDITING
// ─────────────────────────────────────────────

(function() {
  const STORAGE_KEY = 'lobsterboard-layout';
  const GRID_SIZE = 20;
  const MIN_WIDTH = 100;
  const MIN_HEIGHT = 60;
  
  let editMode = false;
  let activeWidget = null;
  let startX, startY, origLeft, origTop, origWidth, origHeight;
  let isResizing = false;

  document.addEventListener('DOMContentLoaded', initEditMode);

  function initEditMode() {
    const btn = document.createElement('button');
    btn.id = 'edit-toggle';
    btn.textContent = '✏️ Edit Layout';
    btn.onclick = toggleEditMode;
    document.body.appendChild(btn);
    document.querySelectorAll('.widget-container').forEach(initWidget);
    loadPositions();
  }

  function initWidget(widget) {
    const handle = document.createElement('div');
    handle.className = 'resize-handle-edit';
    widget.appendChild(handle);
    widget.addEventListener('mousedown', onWidgetMouseDown);
    handle.addEventListener('mousedown', onResizeMouseDown);
  }

  function toggleEditMode() {
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
    document.getElementById('edit-toggle').classList.toggle('active', editMode);
    document.getElementById('edit-toggle').textContent = editMode ? '💾 Save Layout' : '✏️ Edit Layout';
    if (!editMode) savePositions();
  }

  function onWidgetMouseDown(e) {
    if (!editMode) return;
    if (e.target.classList.contains('resize-handle-edit')) return;
    if (e.button !== 0) return;
    e.preventDefault();
    activeWidget = e.currentTarget;
    isResizing = false;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = activeWidget.offsetLeft;
    origTop = activeWidget.offsetTop;
    activeWidget.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onResizeMouseDown(e) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    activeWidget = e.target.parentElement;
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    origWidth = activeWidget.offsetWidth;
    origHeight = activeWidget.offsetHeight;
    activeWidget.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    if (!activeWidget) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (isResizing) {
      activeWidget.style.width = Math.max(MIN_WIDTH, origWidth + dx) + 'px';
      activeWidget.style.height = Math.max(MIN_HEIGHT, origHeight + dy) + 'px';
    } else {
      activeWidget.style.left = Math.max(0, origLeft + dx) + 'px';
      activeWidget.style.top = Math.max(0, origTop + dy) + 'px';
    }
  }

  function onMouseUp() {
    if (!activeWidget) return;
    if (isResizing) {
      activeWidget.style.width = snapToGrid(activeWidget.offsetWidth) + 'px';
      activeWidget.style.height = snapToGrid(activeWidget.offsetHeight) + 'px';
    } else {
      activeWidget.style.left = snapToGrid(activeWidget.offsetLeft) + 'px';
      activeWidget.style.top = snapToGrid(activeWidget.offsetTop) + 'px';
    }
    activeWidget.classList.remove('dragging');
    activeWidget = null;
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  function snapToGrid(value) {
    return Math.round(value / GRID_SIZE) * GRID_SIZE;
  }

  function savePositions() {
    const positions = {};
    document.querySelectorAll('.widget-container').forEach(widget => {
      const id = widget.dataset.widgetId;
      if (id) {
        positions[id] = {
          left: widget.offsetLeft,
          top: widget.offsetTop,
          width: widget.offsetWidth,
          height: widget.offsetHeight
        };
      }
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (e) {}
  }

  function loadPositions() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const positions = JSON.parse(saved);
      document.querySelectorAll('.widget-container').forEach(widget => {
        const id = widget.dataset.widgetId;
        const pos = positions[id];
        if (pos) {
          widget.style.left = pos.left + 'px';
          widget.style.top = pos.top + 'px';
          widget.style.width = pos.width + 'px';
          widget.style.height = pos.height + 'px';
        }
      });
    } catch (e) {}
  }
})();
`;
}

// ─────────────────────────────────────────────
// DASHBOARD GENERATION
// ─────────────────────────────────────────────

/**
 * Generate widget HTML for a widget configuration
 * @param {Object} widget - Widget configuration
 * @returns {string} Widget HTML
 */
export function generateWidgetHtml(widget) {
  const template = WIDGETS[widget.type];
  if (!template) return '';

  const props = { ...widget.properties, id: widget.id };
  let html = processWidgetHtml(template.generateHtml(props), widget.properties.showHeader);

  return `
    <div class="widget-container" data-widget-id="${widget.id}" style="position:absolute;left:${widget.x}px;top:${widget.y}px;width:${widget.width}px;height:${widget.height}px;">
      ${html}
    </div>`;
}

/**
 * Generate widget JavaScript for a widget configuration
 * @param {Object} widget - Widget configuration
 * @returns {string} Widget JavaScript
 */
export function generateWidgetJs(widget) {
  const template = WIDGETS[widget.type];
  if (!template || !template.generateJs) return '';

  const props = { ...widget.properties, id: widget.id };
  return template.generateJs(props);
}

/**
 * Generate complete dashboard HTML
 * @param {Object} config - Dashboard configuration
 * @param {Object} config.canvas - Canvas dimensions { width, height }
 * @param {Array} config.widgets - Array of widget configurations
 * @returns {string} Complete HTML document
 */
export function generateDashboardHtml(config) {
  const { canvas, widgets } = config;
  const widgetHtml = widgets.map(generateWidgetHtml).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My LobsterBoard Dashboard</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <main class="dashboard" style="width:${canvas.width}px;height:${canvas.height}px;position:relative;">
    ${widgetHtml}
  </main>
  <script src="js/dashboard.js"></script>
</body>
</html>`;
}

/**
 * Generate complete dashboard JavaScript
 * @param {Array} widgets - Array of widget configurations
 * @returns {string} Complete JavaScript
 */
export function generateDashboardJs(widgets) {
  const widgetJs = widgets.map(generateWidgetJs).filter(Boolean).join('\n\n');
  const editJs = generateEditJs();

  return `/**
 * LobsterBoard Dashboard - Generated JavaScript
 * Replace YOUR_*_API_KEY placeholders with your actual API keys
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard loaded');
});

${widgetJs}

${editJs}
`;
}

/**
 * Generate README for exported dashboard
 * @param {Array} widgets - Array of widget configurations
 * @returns {string} README markdown
 */
export function generateReadme(widgets) {
  const apiKeys = [];
  const needsOpenClaw = widgets.some(w => 
    ['openclaw-release', 'auth-status', 'activity-list', 'cron-jobs', 'system-log', 'session-count', 'token-gauge'].includes(w.type)
  );
  
  widgets.forEach(widget => {
    const template = WIDGETS[widget.type];
    if (template?.hasApiKey && template.apiKeyName) {
      if (!apiKeys.includes(template.apiKeyName)) {
        apiKeys.push(template.apiKeyName);
      }
    }
  });

  return `# LobsterBoard Dashboard

This dashboard was generated with LobsterBoard Dashboard Builder.

## Quick Start

${needsOpenClaw ? `### Running with OpenClaw widgets

Your dashboard includes widgets that connect to OpenClaw. Run the included server:

\`\`\`bash
node server.js
\`\`\`

Open http://localhost:8080 in your browser.
` : ''}
### Static mode

Open \`index.html\` directly in a browser.

## Files

| File | Description |
|------|-------------|
| \`index.html\` | Dashboard page |
| \`css/style.css\` | Styles |
| \`js/dashboard.js\` | Widget logic |
| \`server.js\` | Server with OpenClaw API proxy |

${apiKeys.length > 0 ? `## API Keys

Edit \`js/dashboard.js\` and replace these placeholders:
${apiKeys.map(key => `- \`YOUR_${key}\``).join('\n')}
` : ''}

---

Generated with LobsterBoard - https://github.com/curbob/LobsterBoard
`;
}

export default {
  escapeHtml,
  processWidgetHtml,
  generateDashboardCss,
  generateEditJs,
  generateWidgetHtml,
  generateWidgetJs,
  generateDashboardHtml,
  generateDashboardJs,
  generateReadme
};
