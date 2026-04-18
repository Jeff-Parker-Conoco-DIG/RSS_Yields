# Backend Cleanup App — Build Guide

The YieldTracker UI app can only **soft-delete** readings (stamp
`data.deleted_at` via PATCH) because the Corva data API's DELETE endpoint
requires backend-grade auth that's not available in an iframe UI app.

Tombstoned records accumulate in `copca/yieldtracker.readings` until a
backend Corva **scheduler app** (or manually-triggered task) hard-deletes
them. This document describes how to build that app.

## What the UI does

When a user deletes a reading, the UI:

1. Removes the row from local state and localStorage (user sees it
   disappear immediately).
2. Sends a `PATCH /api/v1/data/copca/yieldtracker.readings/{_id}` with
   body `{ "data.deleted_at": <unix_ms> }`.
3. On subsequent loads, filters out records where `data.deleted_at != null`.

So tombstones are **hidden from the UI** but still present in the dataset.
Your job is to periodically remove them.

## Corva backend app types

- **Scheduler apps**: triggered by a cron or time-based interval. Best for
  cleanup tasks that don't need real-time reaction.
- **Stream apps**: react to new records in a source dataset.
- **Task apps**: manually triggered via the Corva UI / API.

For this use case a **scheduler app** is the natural fit — run every 15
minutes (or every hour, or nightly) and purge tombstones older than some
grace period.

## Minimum implementation (Python, Corva SDK)

`manifest.json`:

```jsonc
{
  "application": {
    "type": "scheduler",
    "key": "copca.yieldtracker-cleanup",
    "name": "YieldTracker Cleanup",
    "visibility": "private",
    "segments": ["drilling"]
  },
  "settings": {
    "entrypoint": {
      "file": "src/handler.py",
      "function": "lambda_handler"
    },
    "runtime": "python3.11",
    "schedule": {
      "type": "cron",
      "expression": "*/15 * * * *"   // every 15 minutes
    }
  },
  "datasets": {
    "copca.yieldtracker.readings": { "permissions": ["read", "delete"] }
  }
}
```

`src/handler.py`:

```python
import time
from corva import Api, Logger, scheduler

DATASET = "copca/yieldtracker.readings"
# Grace period: only hard-delete tombstones older than this (milliseconds).
# Gives consumer apps a chance to see the tombstone before it's gone.
GRACE_MS = 24 * 60 * 60 * 1000   # 24 hours


@scheduler
def lambda_handler(event, api: Api, logger: Logger):
    cutoff_ms = int(time.time() * 1000) - GRACE_MS

    # Fetch tombstoned records older than the cutoff
    records = api.get_dataset(
        provider="copca",
        dataset="yieldtracker.readings",
        query={
            "data.deleted_at": {"$ne": None, "$lt": cutoff_ms},
        },
        limit=1000,
    )

    if not records:
        logger.info("No tombstones to clean up")
        return

    logger.info(f"Hard-deleting {len(records)} tombstoned readings")

    for rec in records:
        doc_id = rec["_id"]
        try:
            api.delete(
                f"/api/v1/data/{DATASET}/{doc_id}",
            )
            logger.info(
                f"Deleted {doc_id} (reading={rec['data'].get('id')}, "
                f"asset={rec.get('asset_id')}, "
                f"deleted_at={rec['data'].get('deleted_at')})"
            )
        except Exception as e:
            logger.error(f"Failed to delete {doc_id}: {e}")
```

## What the app needs to know

### Tombstone query

```python
{
  "data.deleted_at": { "$ne": None, "$lt": <cutoff_ms> }
}
```

Both predicates matter:
- `$ne: None` — record is tombstoned (not live)
- `$lt: <cutoff>` — older than the grace period

### Grace period

Recommended **24 hours**. Rationale:
- Gives downstream analytics apps a chance to observe the tombstone.
- Lets users undo if they delete by mistake (future UI feature).
- Bounds DB growth to ~1 day of stale records.

Tune shorter (15 min) for aggressive cleanup or longer (7 days) for
recoverability.

### Paging

The query returns at most 1000 records per call. If that's ever
insufficient, page by re-running the query (new tombstones keep
qualifying as the cutoff advances).

## Non-goals (for this app)

- **Don't** modify `data.*` fields. UI handles edits via PATCH.
- **Don't** create new records. Only the UI writes.
- **Don't** ignore `deleted_at`. If a tombstone's `deleted_at` is within
  the grace period, leave it.

## Testing locally

Corva SDK supports local dev with a mock API. Run:

```bash
pip install corva-sdk
python -m corva.testing.scheduler src/handler.py
```

Pass a synthetic tombstoned record through the mock and assert the
`delete` call was made.

## Monitoring

Log every deletion with `doc_id`, `reading_id`, `asset_id`,
`deleted_at`. Corva exposes logs per-app in the Dev Center. Watch for:
- Grace-period violations (shouldn't happen if filter is correct)
- Auth errors (ensure the app's API key has `delete` permission)
- Orphan tombstones — records stuck tombstoned for >> grace period
  (indicates the app isn't running)

## Future extensions

- **Bulk undelete command**: set `data.deleted_at = null` on tombstoned
  records within the grace period. Currently the UI has no undo; a task
  app could expose this.
- **Consumer notification**: publish a Corva stream event when records
  are hard-deleted, so downstream analytics apps can react.
