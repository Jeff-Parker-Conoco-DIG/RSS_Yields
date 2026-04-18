# `copca/yieldtracker.readings` — Dataset Schema

This document describes the Corva custom dataset that the YieldTracker UI
app writes to, so consumer apps (UI or backend) can read and manipulate the
data correctly.

## Dataset coordinates

| Key              | Value                                  |
|------------------|----------------------------------------|
| **Provider**     | `copca`                                |
| **Collection**   | `yieldtracker.readings`                |
| **Full name**    | `copca/yieldtracker.readings`          |
| **REST path**    | `/api/v1/data/copca/yieldtracker.readings/` |
| **Key**          | `asset_id` (well's Corva numeric ID)   |
| **Versioning**   | `version: 1` on every record           |

Consumer apps must declare this dataset in their `manifest.json` with the
appropriate permissions:

```json
{
  "datasets": {
    "copca.yieldtracker.readings": { "permissions": ["read"] }
  }
}
```

Backend cleanup apps that hard-delete tombstoned records need
`["read", "delete"]`.

## Record shape (top-level)

Each record is a Corva data document:

```jsonc
{
  "_id": "…",               // Corva-assigned document _id
  "asset_id": 15354502,     // Corva well asset_id (NUMBER, not string)
  "timestamp": 1776517020,  // Unix SECONDS when the reading was taken
  "version": 1,             // Schema version (bump when breaking changes)
  "data": { /* see below */ }
}
```

**Ordering**: records are sorted by `timestamp` and `_id`. If you need
depth-ordered traversal, sort by `data.depth` instead — readings can be
backfilled out of time order.

## `data` object

Fields grouped by concern. All numeric fields are `number | null` unless
noted.

### Identity & soft-delete

| Field              | Type             | Notes                                              |
|--------------------|------------------|----------------------------------------------------|
| `id`               | string (UUID)    | Stable reading ID, used for updates/deletes        |
| `well_name`        | string \| null   | Denormalized — e.g. `"MABEE DDA E29 412JH"`        |
| `well_asset_id`    | number           | Denormalized duplicate of top-level `asset_id`     |
| `deleted_at`       | number \| null   | **Tombstone timestamp (unix ms)**. See below       |

**Soft-delete pattern**: the UI cannot DELETE records directly (iframe
auth limits). When a user deletes a reading, the UI sets
`data.deleted_at = Date.now()` via PATCH. The UI filters these out of the
visible table. A backend app is expected to poll for records where
`data.deleted_at != null` and hard-delete them. Consumer apps should
**filter out `deleted_at != null` on read** unless they specifically want
tombstones.

### Depth & survey snapshot

| Field              | Units   | Notes                                           |
|--------------------|---------|-------------------------------------------------|
| `depth`            | ft (MD) | Bit measured depth at reading                   |
| `tvd`              | ft      | True Vertical Depth interpolated from MWD surveys|
| `inc`              | deg     | Near-bit inclination (RSS) or MWD inc in motor mode |
| `az`               | deg     | Azimuth, 0–360                                  |
| `mwdInc`, `mwdAz`  | deg     | Separate MWD-sensor survey (null in motor mode) |
| `sensorDepth`      | ft      | Bit depth minus MWD bit-to-survey offset        |
| `formation`        | string  | Formation name at `depth`, using `data.formations`|

### Interval (from previous reading)

| Field              | Units        | Notes                              |
|--------------------|--------------|------------------------------------|
| `courseLength`     | ft           | Distance from previous reading    |
| `br`               | °/100ft      | RSS build rate                     |
| `tr`               | °/100ft      | RSS turn rate                      |
| `dls`              | °/100ft      | RSS dogleg severity                |
| `mwdBr`, `mwdTr`, `mwdDls` | °/100ft | MWD equivalents (ground truth) |
| `deltaInc`, `deltaAz` | deg       | RSS − MWD                          |

**All rates are in degrees per 100 feet** (imperial). No °/30m fields.

### Slide / rotate breakdown

| Field              | Units        | Notes                              |
|--------------------|--------------|------------------------------------|
| `slideFt`          | ft           | Slide footage in this interval     |
| `rotateFt`         | ft           | Rotate footage in this interval    |
| `slideSeen`        | ft           | Portion of active slide past MWD sensor |
| `slideAhead`       | ft           | Portion of active slide between sensor and bit |
| `slideStartDepth`, `slideEndDepth` | ft | Active slide interval boundaries |
| `tfAccuracy`       | %            | Footage-weighted toolface accuracy |

### Motor yield

| Field              | Units        | Notes                              |
|--------------------|--------------|------------------------------------|
| `sheetMotorYield`  | °/100ft      | Corva slide-sheet weighted motor_yield over interval |
| `sheetBrYield`, `sheetTrYield` | °/100ft | Build/turn components   |
| `normalizedDls`    | °/100ft      | MY APP — observed DLS scaled to 100% slide |
| `normalizedBr`, `normalizedTr` | °/100ft | Build/turn components      |
| `dls_outlier`      | boolean      | True when `|dls|` > 30 °/100ft — excluded from MY APP and yield regression |

### Steering parameters

| Field              | Units        | Notes                              |
|--------------------|--------------|------------------------------------|
| `dutyCycle`        | 0-100        | Slide duty cycle                   |
| `toolFaceSet`      | deg          | Commanded gravity toolface         |
| `toolFaceActual`   | deg          | Achieved gravity toolface          |
| `toolFaceStdDev`   | deg          | Toolface stability (usually null)  |
| `steeringForce`    | 0-100        | Force setpoint                     |
| `resultantTF`      | deg          | Back-calculated from BR/TR         |
| `buildCommand`, `turnCommand` | 0-1 | `(DC/100) × cos(TF)` and `sin(TF)` |

### Metadata

| Field              | Type               | Notes                           |
|--------------------|--------------------|---------------------------------|
| `section`          | `"curve"|"uturn"` | Well section at capture         |
| `source`           | `"auto"|"manual"` | How the reading was triggered   |
| `notes`            | string             | Free-form user-editable notes   |

## Query examples

### Fetch live readings for a well (exclude tombstones)

```http
GET /api/v1/data/copca/yieldtracker.readings/
  ?query={"asset_id":15354502,"data.deleted_at":null}
  &sort={"data.depth":1}
  &limit=5000
```

### Find tombstones to hard-delete (for backend cleanup app)

```http
GET /api/v1/data/copca/yieldtracker.readings/
  ?query={"data.deleted_at":{"$ne":null}}
  &limit=1000
```

### Update notes on an existing reading (UI-side, via PATCH)

```http
PATCH /api/v1/data/copca/yieldtracker.readings/{_id}
Content-Type: application/json

{ "data.notes": "new notes text" }
```

### Tombstone a reading (UI-side, via PATCH)

```http
PATCH /api/v1/data/copca/yieldtracker.readings/{_id}
Content-Type: application/json

{ "data.deleted_at": 1776517020000 }
```

### Hard-delete a record (backend apps only)

```http
DELETE /api/v1/data/copca/yieldtracker.readings/{_id}
Authorization: API <backend-app-key>
```

## Legacy record handling

Fields added after initial release may be missing on older records:

- `well_name`, `well_asset_id` — added 2026-04. Older records: `null`.
- `tvd` — added 2026-04. Older records: `null`.
- `dls_outlier` — added 2026-04. Derive from `|mwdDls ?? dls| > 30` if missing.
- `deleted_at` — added 2026-04. Older records: `null` (i.e. live).

Consumer apps should treat missing fields as `null` and derive what they
can on-the-fly rather than writing migrations.
