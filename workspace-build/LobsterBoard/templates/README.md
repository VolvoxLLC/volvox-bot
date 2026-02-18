# LobsterBoard Templates

Templates are pre-built dashboard layouts that can be browsed, previewed, and imported into your LobsterBoard instance.

## Creating a Template

### The Easy Way (Export)

1. Build your dashboard in LobsterBoard's edit mode
2. Click **"📦 Export Template"** in the toolbar
3. Fill in the name, description, author, and tags
4. Your template is saved automatically with sensitive data stripped

### Manual Creation

Create a folder inside `templates/` with a unique slug name:

```
templates/
└── my-template/
    ├── meta.json       # Template metadata
    ├── config.json     # Dashboard configuration
    └── preview.png     # Preview screenshot (optional, recommended)
```

#### meta.json

```json
{
  "id": "my-template",
  "name": "My Template",
  "description": "A brief description of what this dashboard does",
  "author": "your-name",
  "tags": ["monitoring", "homelab"],
  "canvasSize": "1920x1080",
  "widgetCount": 8,
  "requiresSetup": ["docker"],
  "preview": "preview.png"
}
```

#### config.json

This is a standard LobsterBoard config file with `canvas` and `widgets` array. Sensitive values (API keys, private URLs) should use placeholders:

- `"YOUR_API_KEY_HERE"` for API keys, tokens, secrets
- `"http://your-server:port/path"` for private/local URLs

Any widget with stripped data should include:
```json
"_templateNote": "⚠️ Configure this widget's settings after import"
```

#### preview.png

A screenshot of the dashboard. Recommended size: 800×450px or similar 16:9 ratio.

## Template Registry

The `templates.json` file in this directory is auto-generated. It contains an array of all `meta.json` contents. The server rebuilds it by scanning template directories on startup and when templates are added.

## Importing Templates

- **Replace**: Overwrites your entire current dashboard with the template
- **Merge**: Adds template widgets below your existing widgets (positions are offset automatically)

## Sharing Templates

To share a template, just share the template folder (the directory with `meta.json`, `config.json`, and optionally `preview.png`). Drop it into another LobsterBoard's `templates/` directory.
