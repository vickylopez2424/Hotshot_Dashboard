# Hotshot Dashboard — MCP Server (Phase 1)

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes
the dashboard's live wildfire data as tools any AI assistant can call. Phase 1 is
**read-only** and runs locally over **stdio** — no hosting, no cost.

It imports the existing `backend/integrations/*` code directly (no HTTP hop), so
the dashboard and the MCP server share one set of connectors.

## Tools

| Tool | Needs API key? | What it answers |
|---|---|---|
| `list_active_incidents` | No | What fires are burning right now (NIFC IRWIN) |
| `get_incident_trends` | No | Year-to-date fire counts, causes, acreage |
| `get_fire_weather_alerts` | No | Red Flag Warnings & fire weather watches (NWS) |
| `get_raws_weather_stations` | Synoptic | RAWS temp/humidity/wind + fire danger level |
| `get_satellite_fire_detections` | FIRMS | NASA VIIRS satellite hotspots |
| `get_air_quality` | AirNow | Wildfire smoke / AQI by area |
| `situational_summary` | partial | One-call composite brief for a state |
| `draft_ics209` | No | Draft an ICS-209 Incident Status Summary for a fire |

Tools whose API key isn't set still return cleanly — they just report that the
feed needs a key. `list_active_incidents` and `get_fire_weather_alerts` work today
with no setup.

## Install

The MCP server reuses the backend's virtualenv. From the repo root:

```bash
backend/.venv/bin/pip install -r mcp_server/requirements.txt
```

## Connect it to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` and add an
`mcpServers` block (keep any existing `preferences` block):

```json
{
  "mcpServers": {
    "hotshot-dashboard": {
      "command": "/Users/vickylopez/Desktop/NB Tech Buiness Docs 2026/Hotshot_Dashboard/backend/.venv/bin/python",
      "args": ["/Users/vickylopez/Desktop/NB Tech Buiness Docs 2026/Hotshot_Dashboard/mcp_server/server.py"]
    }
  }
}
```

Then **fully quit and reopen Claude Desktop**. The Hotshot tools appear under the
🔌 (tools) icon.

## Demo it

In Claude Desktop, ask:

> *What wildfires are burning in California right now?*
> *Are there any Red Flag Warnings I should pre-position resources for?*
> *Give me a situational summary for California.*
> *Draft an ICS-209 for the Santa Rosa Island fire.*

Claude calls the tools, reads the live data, and reasons about it — e.g.
recommends staging crews or ordering equipment ahead of dangerous fire weather.

## Test without Claude

```bash
cd mcp_server
../backend/.venv/bin/python -c "import server, json; print(json.dumps(server.situational_summary('CA'), indent=2, default=str))"
```

## Notes

- **Transport:** stdio only in Phase 1. Phase 2 adds an HTTP/SSE transport for
  remote field clients (deploy alongside the backend on Render).
- **`sse-starlette` dependency warning:** harmless. `sse-starlette` is only used
  by the Phase-2 HTTP transport; the stdio server never imports it.
- **Auth/logging/telemetry ingestion:** Phase 2 — see `../MCP_Server_Plan.md`.
