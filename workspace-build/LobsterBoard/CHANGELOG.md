# Changelog

## [0.2.0] - 2025-02-15

### Added
- **Template Gallery** — export, import, and share dashboard layouts with auto-screenshot previews
  - `js/templates.js` — new template gallery UI and export system
  - Templates API: list, get, preview, import (merge/replace), export, delete
  - `templates/` directory with bundled starter templates
  - Template modal with search, preview lightbox, and import options
- **Notes widget** — persistent rich-text notes with auto-save via `/api/notes`
- **Browse button** for directory selection in image widgets (Image, Random Image, Latest Image)
- **GitHub Stats widget rework** — profile contributions, stars, and activity with property bindings
- **LobsterBoard Release widget** — version update checker via `/api/lb-release`
- **SSE streaming** for system stats (`/api/stats/stream`)
- **Browse directories API** (`/api/browse-dirs`) for server-side directory picker
- Sidebar reorder, verified checkmarks, delete button, tooltips in editor
- html2canvas-based dashboard screenshot export
- Scrollable canvas mode

### Changed
- Stock Ticker widget — fixed `hasApiKey` check
- Builder — contenteditable keyboard fix, null-checks throughout
- License changed from MIT to BSL-1.1
- Widget count: 47 → 50

### Removed
- GPT Usage widget (standalone) — use AI Cost Tracker or Claude Usage instead

## [0.1.6] - 2025-02-14

- Initial public npm release
- 47 widgets, drag-and-drop editor, custom pages system
- SSRF protection for proxy endpoints
