# Creating Custom Pages

## Quick Start

Tell your OpenClaw agent:

> "Create a new LobsterBoard page called [name] that [description]"

Your agent will create the page folder in `pages/` with the required files.

## Manual Setup

### File Structure

```
pages/
└── my-page/
    ├── page.json       # Required: metadata
    ├── index.html      # Required: page HTML
    ├── api.cjs         # Optional: server-side API routes (use .cjs extension)
    └── style.css       # Optional: additional styles
```

### page.json Schema

```json
{
  "id": "my-page",           // URL slug, must match folder name
  "title": "My Page",        // Display name in nav
  "icon": "🔖",              // Emoji icon for nav
  "description": "What this page does",
  "order": 50,               // Sort position (lower = first)
  "enabled": true,           // Whether page is active
  "nav": true,               // Show in navigation bar (default: true)
  "standalone": true          // true = works without OpenClaw
}
```

### API Format (api.cjs)

> **Note:** Use `.cjs` extension since LobsterBoard's package.json has `"type": "module"`.

```js
module.exports = function(ctx) {
  // ctx.dataDir — absolute path to data/<page-id>/
  // ctx.readData(filename) — read and parse JSON file from data dir
  // ctx.writeData(filename, obj) — write JSON object to data dir

  return {
    routes: {
      'GET /': (req, res, { query, body, params }) => {
        // Return value is sent as JSON automatically
        return { items: [] };
      },

      'POST /': (req, res, { body }) => {
        // body is the parsed JSON request body
        const item = { id: Date.now().toString(), ...body };
        res.statusCode = 201;
        return item;
      },

      'GET /:id': (req, res, { params }) => {
        // :id params are extracted automatically
        return { id: params.id };
      },

      'PATCH /:id': (req, res, { body, params }) => {
        // Set res.statusCode for non-200 responses
        res.statusCode = 404;
        return { error: 'Not found' };
      },

      'DELETE /:id': (req, res, { params }) => {
        return { ok: true };
      },

      // Wildcard routes (match multiple path segments)
      'GET /*': (req, res, { params }) => {
        // params['*'] contains the matched path
        return { path: params['*'] };
      }
    }
  };
};
```

Handlers receive `(req, res, { query, body, params })`:
- **query** — parsed URL query parameters
- **body** — parsed JSON request body (POST/PATCH/DELETE)
- **params** — URL path parameters (`:id`, `*`)
- **Return value** — automatically JSON-serialized and sent

### Using the Shared Nav

Include in your `index.html`:

```html
<nav id="page-nav"></nav>
<!-- ... your page content ... -->
<script src="/pages/_shared/nav.js"></script>
```

The nav bar fetches `/api/pages` and renders links for all enabled pages, highlighting the current one.

### Storing Data

Data lives in `data/<page-id>/`. Use the `ctx` helpers:

```js
// Read
const data = ctx.readData('items.json');

// Write
ctx.writeData('items.json', { items: [...] });
```

Initialize your data file in `data/<page-id>/` with default content.

### Enable/Disable Pages

Edit `pages.json` in the LobsterBoard root:

```json
{
  "pages": {
    "my-page": { "enabled": true, "order": 50 },
    "other-page": { "enabled": false }
  }
}
```

Or set `"enabled": false` in the page's own `page.json`. The `pages.json` overrides take priority.

Restart the server after changes.

## Full Example: Bookmarks Page

### pages/bookmarks/page.json

```json
{
  "id": "bookmarks",
  "title": "Bookmarks",
  "icon": "🔖",
  "description": "Save and organize bookmarks",
  "order": 40,
  "enabled": true,
  "standalone": true
}
```

### data/bookmarks/bookmarks.json

```json
{ "bookmarks": [] }
```

### pages/bookmarks/api.cjs

```js
const crypto = require('crypto');

module.exports = function(ctx) {
  function read() {
    try { return ctx.readData('bookmarks.json'); }
    catch { return { bookmarks: [] }; }
  }
  function write(data) { ctx.writeData('bookmarks.json', data); }

  return {
    routes: {
      'GET /': (req, res, { query }) => {
        const data = read();
        let items = data.bookmarks;
        if (query.q) {
          const q = query.q.toLowerCase();
          items = items.filter(b => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
        }
        return items;
      },

      'POST /': (req, res, { body }) => {
        const data = read();
        const bookmark = {
          id: crypto.randomUUID(),
          title: body.title || 'Untitled',
          url: body.url || '',
          tags: body.tags || [],
          createdAt: new Date().toISOString()
        };
        data.bookmarks.push(bookmark);
        write(data);
        res.statusCode = 201;
        return bookmark;
      },

      'DELETE /:id': (req, res, { params }) => {
        const data = read();
        const idx = data.bookmarks.findIndex(b => b.id === params.id);
        if (idx === -1) { res.statusCode = 404; return { error: 'Not found' }; }
        data.bookmarks.splice(idx, 1);
        write(data);
        return { ok: true };
      }
    }
  };
};
```

### pages/bookmarks/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LobsterBoard - Bookmarks</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0d1117; color: #e6edf3; }
    .container { max-width: 800px; margin: 0 auto; padding: 1.5rem; }
    /* ... your styles ... */
  </style>
</head>
<body>
  <nav id="page-nav"></nav>
  <main class="container">
    <h1>🔖 Bookmarks</h1>
    <!-- your page content -->
  </main>
  <script src="/pages/_shared/nav.js"></script>
  <script>
    const API = '/api/pages/bookmarks';
    // ... your page logic, fetch from API ...
  </script>
</body>
</html>
```

### pages.json (add entry)

```json
{
  "pages": {
    "bookmarks": { "enabled": true, "order": 40 }
  }
}
```

Restart the server and visit `/pages/bookmarks`.
