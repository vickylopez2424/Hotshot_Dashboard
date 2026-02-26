# Adding a New Platform to Hotshot Dashboard

The dashboard is designed so each new platform requires changes in exactly 5 places.
No core code needs to be modified.

---

## Step-by-Step

### 1. Backend — Create the integration connector

```bash
cp -r backend/integrations/_template backend/integrations/<platform_id>
```

Edit `connector.py`:
- Set `platform_id` and `platform_name`
- Implement `get_status()` and `get_data()`
- Add API endpoints to the `router`

### 2. Backend — Mount the router in `main.py`

```python
from integrations.<platform_id>.connector import router as <platform_id>_router
app.include_router(<platform_id>_router, prefix="/api/<platform_id>", tags=["<Platform Name>"])
```

### 3. Frontend — Register in `src/config/platforms.js`

```js
{
  id: '<platform_id>',
  label: 'My Platform',
  icon: '🗺️',
  enabled: true,
  mapLayer: true,
  apiBase: '/api/<platform_id>',
  description: 'What this platform provides',
}
```

### 4. Frontend — Create a map layer (if applicable)

Create `src/components/Map/layers/<PlatformName>Layer.jsx` and add it to `MapView.jsx`:

```jsx
{isLayerActive('<platform_id>') && <PlatformNameLayer />}
```

### 5. Frontend — Create a right-panel component (if applicable)

Create `src/components/<PlatformName>/<PlatformName>Panel.jsx` and add it to the right panel in `App.jsx`:

```jsx
{activePanel === '<platform_id>' && <PlatformNamePanel />}
```

---

## Checklist

- [ ] `backend/integrations/<platform_id>/connector.py` — API connector
- [ ] `backend/main.py` — router mounted
- [ ] `frontend/src/config/platforms.js` — platform registered
- [ ] `frontend/src/components/Map/layers/<Platform>Layer.jsx` — map overlay
- [ ] `frontend/src/components/<Platform>/<Platform>Panel.jsx` — right panel

---

## Current Platforms

| Platform | Folder | Status |
|---|---|---|
| NASA FIRMS | `integrations/firms` | Stub |
| ELMFIRE | `integrations/elmfire` | Stub |
| ALERTWildfire | `integrations/cameras` | Stub |
| WIMS/RAWS | `integrations/wims` | Stub |
| Rx Fire Weather | `integrations/rx_weather` | Stub |
