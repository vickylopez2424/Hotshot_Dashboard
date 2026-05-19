# Hotshot Dashboard — Data Pipeline

The start of the data moat. This pipeline captures the wildfire picture **over
time** so there's a dataset to train ML on later. The dashboard shows "now";
ML needs "history" — that's what this collects.

## What it does

Every 3 hours, `snapshot.py`:
1. Pulls every active wildfire incident nationwide from NIFC IRWIN
2. Pulls every active NWS fire weather alert (Red Flag Warnings, etc.)
3. Appends a timestamped row per record to a local SQLite database

Each run is one slice of time. Stacked over weeks, the slices form the
*trajectory* of every fire (10 acres → 500 → 5,000). The data **self-labels**:
IRWIN eventually records each fire's final size, so every trajectory comes with
its own training answer.

## Storage

A local SQLite file: `data_pipeline/data/hotshot_history.db` — zero setup, zero
cost, no account. Three tables (see `db.py`):

| Table | Row meaning |
|---|---|
| `snapshot_runs` | One per poll — for monitoring "did it run?" |
| `incident_snapshots` | One per active fire, per poll |
| `fire_weather_snapshots` | One per active fire weather alert, per poll |

The schema maps cleanly to Postgres / Supabase when you move to the cloud.

## It runs on its own

A macOS **launchd** job (`com.nbtech.hotshot.snapshots.plist`) runs the poller
every 3 hours (`StartInterval` 10800s), automatically, with no terminal open.
It survives reboots and catches up after sleep.

**Already installed.** To manage it:

```bash
# Check it's registered
launchctl list | grep hotshot

# See what's been collected
backend/.venv/bin/python data_pipeline/snapshot.py stats

# Watch the log
tail -f data_pipeline/data/snapshot.log

# Run one poll right now (manual)
backend/.venv/bin/python data_pipeline/snapshot.py

# Stop / restart the schedule
launchctl unload ~/Library/LaunchAgents/com.nbtech.hotshot.snapshots.plist
launchctl load -w ~/Library/LaunchAgents/com.nbtech.hotshot.snapshots.plist
```

If you move or rename the project folder, update the paths in
`com.nbtech.hotshot.snapshots.plist`, copy it to `~/Library/LaunchAgents/`, and
reload it.

## Why start now

Data you don't capture today is gone forever — you cannot reconstruct how a fire
looked at hour 6 after the fact. Every poll that runs is permanent dataset
growth, even before you have a single customer. This is the cheapest,
highest-leverage thing in the whole project.

See `../Hotshot_Dashboard_ML_Data_Roadmap.md` for how this feeds the ML use cases.
