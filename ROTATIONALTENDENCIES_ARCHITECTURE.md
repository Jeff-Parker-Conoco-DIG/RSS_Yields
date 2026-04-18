# rotationaltendencies Architecture — Extracted from HAR Files

**Generated:** 2026-04-17 08:17:34
**Source files:** C:/Users/digdd1/Downloads/rotationaltendencies.beta.corva.ai.har
**Total unique endpoint patterns:** 55
**Total datasets discovered:** 20
**Total metric keys:** 0
**Total component families:** 0
**Asset IDs seen:** [44307597]
**Company IDs seen:** [3]

### Dashboard Context
- **dashboard_slug:** `506436/data_filters`
- **has_app_catalog:** `True`
- **rigAssetId:** `41655357`
- **rigId:** `2135`
- **wellAssetId:** `44307597`
- **wellId:** `118012`

### User Settings Keys
- **offset_well_picker_5_settings_v1:**
```json
{
  "isMapHidden": false,
  "isFilterExpanded": true,
  "mapStyle": "satellite"
}
```
- **singleAsset:**
```json
{
  "interventionWellId": 107516,
  "completionWellAssetId": null,
  "enrichment": [],
  "interventionWellAssetId": 40545680,
  "shouldUseActiveWell": true,
  "rowOfFirstData": 3,
  "wellId": 118012,
  "rigId": 2135,
  "headerRow": 1,
  "padId": 10739,
  "drilloutUnitId": 163,
  "apps": [],
  "postprocessing": {
    "executed_steps": [
      "remove_app_schedules"
    ],
    "cleanup_started_at": "2020-10-11T22:23:00.757Z",
    "cleared_app_connections": [
      664759,
      664760,
      664761,
      664762,
      664763
    ]
  },
  "logIds": [
    "Time_1Sec"
  ],
  "unitRow": 2,
  "interventionUnitId": 15,
  "selected_template_ids": [
    "drilling-time-witsml-new-source-app"
  ],
  "sources": [],
  "rigAssetId": 41655357,
  "fracFleetId": 3345,
  "wellAssetId": 44307597
}
```

---
## 1. API Endpoint Catalog

### Host: `api.corva.ai`

#### `GET /options/`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "keys[]": [
    "homepage_marketing_webm_url",
    "homepage_marketing_mp4_url",
    "homepage_marketing_image_url",
    "homepage_marketing_image_redirect_link",
    "corva_app_logo",
    "corva_app_logo_3_0",
    "corva_app_logo_tooltip_text",
    "corva_app_logo_tooltip_text_3_0",
    "login_additional_link_text",
    "login_additional_link_url"
  ]
}
```

#### `GET /v1/companies`
- **Status codes:** 304
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v1/data/corva/wits`
- **Status codes:** 200
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "asset_id": 44307597,
  "fields": "data.hole_depth,data.bit_depth"
}
```

#### `GET /v1/data/corva/wits.summary-30m`
- **Status codes:** 304
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "asset_id": 44307597,
  "behavior": "accumulate",
  "fields": "timestamp,data.hole_depth,data.bit_depth",
  "limit": 10000,
  "sort": "{timestamp:1}"
}
```

#### `GET /v1/notifications`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "acknowledged": false,
  "notification_type": "banner",
  "order": "desc",
  "per_page": 20,
  "sort": "created_at",
  "trigger_type[]": "alert"
}
```

#### `GET /v1/notifications/count/unread`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "trigger_type[]": [
    "activity",
    "comment",
    "like",
    "dashboard_app_annotation",
    "package_review",
    "app_purchase",
    "app_error_alert",
    "asset",
    "partial_well_rerun"
  ]
}
```

#### `GET /v1/users/13324/dashboards/506436/data_filters`
- **Status codes:** 304
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

#### `PUT /v1/users/13324/dashboards/519411/dashboard_apps/3670943`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "asset_id": 44307597
}
```

**Request body (PUT):**
```json
{
  "id": 3670943,
  "name": "Slide Sheet",
  "category": "directional",
  "settings": {
    "rigId": null,
    "wellId": null,
    "package": "PROD",
    "settings": {
      "showFormations": true,
      "showBreakingSlides": false,
      "showAverageValues": false,
      "columnsToDisplay": {
        "start_timestamp": true,
        "end_timestamp": true,
        "start_measured_depth": true,
        "end_measured_depth": true,
        "start_tvd": true,
        "end_tvd": true,
        "slide_duration": true,
        "length": true,
        "rop": true,
        "flow_rate": true,
        "tfo": true,
        "effective_toolface": true,
        "tfo_accuracy": true,
        "weight_on_bit": true,
        "pdm_differential_pressure": false,
        "pdm_torque": false,
        "dls": true,
        "build_rate": true,
        "turn_rate": true,
        "motor_yield": true
      },
      "columnsOrder": [
        "start_measured_depth",
        "end_measured_depth",
        "start_timestamp",
        "end_timestamp",
        "slide_duration",
        "length",
        "rop",
        "flow_rate",
        "tfo",
        "effective_toolface",
        "tfo_accuracy",
        "weight_on_bit",
        "pdm_differential_pressure",
        "pdm_torque",
        "dls",
        "build_rate",
        "motor_yield",
        "turn_rate",
        "start_tvd",
        "end_tvd"
      ],
      "isShowChart": false,
      "chartsToDisplay": {
        "dls": false,
        "tfo": false,
        "length": false,
        "build_rate": false,
        "motor_yield": true,
        "tfo_accuracy": true,
        "effective_toolface": true,
        "slide_duration_origin": false
      },
      "countOfSlidesToDisplay": "last10",
      "sortDirection": "asc",
      "settingsByAsset": {
        "15031900": {
          "filters": {
            "filterBy": "wellSection"
          }
        },
        "15266733": {
          "filters": {
            "filter": [
              "69da9955b622bcaf68f92
  ... (truncated)
```

**Request body schema:**
```json
{
  "id": "int",
  "name": "string",
  "category": "string",
  "settings": {
    "rigId": "null",
    "wellId": "null",
    "package": "string",
    "settings": {
      "showFormations": "boolean",
      "showBreakingSlides": "boolean",
      "showAverageValues": "boolean",
      "columnsToDisplay": {
        "start_timestamp": "boolean",
        "end_timestamp": "boolean",
        "start_measured_depth": "boolean",
        "end_measured_depth": "boolean",
        "start_tvd": "boolean",
        "end_tvd": "boolean",
        "slide_duration": "boolean",
        "length": "boolean",
        "rop": "boolean",
        "flow_rate": "boolean",
        "tfo": "boolean",
        "effective_toolface": "boolean",
        "tfo_accuracy": "boolean",
        "weight_on_bit": "boolean",
        "pdm_differential_pressure": "boolean",
        "pdm_torque": "boolean",
        "dls": "boolean",
        "build_rate": "boolean",
        "turn_rate": "boolean",
        "motor_yield": "boolean"
      },
      "columnsOrder": [
        "string"
      ],
      "isShowChart": "boolean",
      "chartsToDisplay": {
        "dls": "boolean",
        "tfo": "boolean",
        "length": "boolean",
        "build_rate": "boolean",
        "motor_yield": "boolean",
        "tfo_accuracy": "boolean",
        "effective_toolface": "boolean",
        "slide_duration_origin": "boolean"
      },
      "countOfSlidesToDisplay": "string",
      "sortDirection": "string",
      "settingsByAsset": {
        "15031900": {
          "filters": "..."
        },
        "15266733": {
          "filters": "..."
        },
        "44307597": {
          "filters": "..."
        },
        "52040841": {
          "filters": "..."
        },
        "52201536": {
          "filters": "..."
        },
        "77297455": {
          "filters": "..."
        },
        "81215918": {
          "filters": "..."
        }
      }
    }
  },
  "coordinates": {
    "h": "int",
    "w": "int",
    "x": "int",
    "y": 
```

#### `GET /v1/users/13324/dashboards/519411/data_filters`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v1/users/13324/dashboards/jdp-ea4e044468`
- **Status codes:** 200
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "asset_id": 44307597
}
```

#### `GET /v1/users/13324/dashboards/slide-sheet-7400b76fb7`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "asset_id": 44307597
}
```

#### `POST /v1/users/13324/settings`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Request body (POST):**
```json
{
  "offset_well_picker_5_settings_v1": {
    "isMapHidden": false,
    "isFilterExpanded": true,
    "mapStyle": "satellite"
  }
}
```

**Request body schema:**
```json
{
  "offset_well_picker_5_settings_v1": {
    "isMapHidden": "boolean",
    "isFilterExpanded": "boolean",
    "mapStyle": "string"
  }
}
```

#### `GET /v1/users/13324/settings/offset_well_picker_5_settings_v1`
- **Status codes:** 304
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v1/users/current`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v2/ability_check/check_permission`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "ability": "update",
  "resource_class": "settings-drillstrings_settings_app"
}
```

#### `GET /v2/apps/app_categories`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "category": "wellhub",
  "fields": "all"
}
```

#### `GET /v2/assets`
- **Status codes:** 200, 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": [
    "asset.name",
    "asset.company_id",
    "asset.parent_asset_id",
    "asset.parent_asset_name",
    "asset.status",
    "asset.stats",
    "asset.target_formation",
    "asset.string_design",
    "asset.root_asset_name",
    "asset.basin",
    "asset.county",
    "asset.area",
    "asset.visibility",
    "asset.top_hole",
    "asset.settings",
    "asset.last_active_at",
    "asset.last_drilling_at"
  ],
  "ids[]": 44307597,
  "page": 1,
  "per_page": 2000,
  "sort": "name",
  "types[]": "well"
}
```

#### `GET /v2/assets/44307597`
- **Status codes:** 200
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": "all",
  "include_rig_id": true
}
```

#### `GET /v2/dashboard_app_annotations/last_annotations`
- **Status codes:** 304
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "dashboard_id": 519411
}
```

#### `GET /v2/dashboard_folder_shares`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "owner_id": 13324,
  "viewed": false
}
```

#### `GET /v2/dashboards`
- **Status codes:** 200, 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "layout": "tabs",
  "segment": "drilling",
  "type": "asset_dashboard",
  "visibility": "visible"
}
```

#### `GET /v2/favorites`
- **Status codes:** 200, 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v2/rigs`
- **Status codes:** 200, 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": [
    "rig.id",
    "rig.name",
    "rig.asset_id",
    "rig.active_well",
    "rig.type"
  ],
  "ids[]": 2135
}
```

#### `GET /v2/rigs/2135`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": "rig.asset_id"
}
```

#### `POST /v2/tasks`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Request body (POST):**
```json
{
  "task": {
    "provider": "corva",
    "app_key": "tasks.trajectory-translator",
    "asset_id": 44307597,
    "properties": {
      "action": "measured_depth_to_station",
      "survey_source": "data.actual_survey",
      "measured_depth": [
        580.3,
        596.2,
        702.9,
        718.6,
        703.1,
        715.0014,
        722.1,
        743.2,
        910.2,
        918.7,
        976.8,
        982,
        1032.6,
        1041,
        1071.4,
        1097.9,
        1071.5,
        1085.0022,
        1103.1,
        1126,
        1137.4,
        1151.4,
        1323.7,
        1339.4,
        1357,
        1363.1,
        1533,
        1536,
        1554.4,
        1582.7,
        1557.0031,
        1635.1,
        1663,
        1652.0033,
        1730.2,
        1762.9,
        1746.0035,
        1825.9,
        1853.7,
        1841.0037,
        1920.4,
        1953.1,
        1936.0039,
        2010.3,
        2046.8,
        2031.0041,
        2325.4,
        2350.4,
        2765,
        2790.3,
        2784.0056,
        2955.1,
        2979.1,
        2972.0059,
        3235,
        3270.7,
        3235.2,
        3256.0065,
        3555.2,
        3581.2,
        3620.3,
        3659.9,
        3632.0073,
        3712.1,
        3734.9,
        3726.0075,
        3995.1,
        4030.2,
        4010.008,
        4090.4,
        4115,
        4105.0082,
        4351.2519,
        4373.9653,
        4461.5673,
        4481.9296,
        4466.0089,
        4677.6645,
        4702.3837,
        4929.416,
        4956.1357,
        4940.0099,
        5045.8696,
        5065.5849,
        7694.2416,
        7718.956,
        8061.7832,
        8086.4736,
        8067.0161
      ]
    }
  }
}
```

**Request body schema:**
```json
{
  "task": {
    "provider": "string",
    "app_key": "string",
    "asset_id": "int",
    "properties": {
      "action": "string",
      "survey_source": "string",
      "measured_depth": [
        "float"
      ]
    }
  }
}
```

#### `GET /v2/tasks/0737ecd4-ee85-43bd-8641-4565fe6ccafa`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v2/tasks/a2c3740b-7f57-45f7-aec4-311779c7a53f`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v2/users/13324/dashboard_folders`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

#### `GET /v2/wells`
- **Status codes:** 200, 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": [
    "well.name",
    "well.settings",
    "well.company",
    "well.asset_id",
    "well.last_active_at",
    "well.program",
    "well.pad",
    "well.frac_fleet",
    "well.id",
    "well.rig",
    "rig.name",
    "rig.asset_id",
    "company.id",
    "well.status",
    "well.archivation",
    "well.lon_lat"
  ],
  "ids[]": 118012,
  "include_arhivation_data": true
}
```

#### `GET /v2/wells/118012`
- **Status codes:** 304
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields[]": "well.asset_id"
}
```

#### `GET /v2/workflows`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "allow_empty_company": true,
  "company_id": 25,
  "visibility": "public"
}
```

### Host: `app.beta.corva.ai`

#### `GET /dashboards/slide-sheet-7400b76fb7`
- **Status codes:** 304
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "rigId": 2135,
  "wellId": 118012,
  "rigAssetId": 41655357,
  "wellAssetId": 44307597
}
```

### Host: `data.corva.ai`

#### `GET /api/v1/data/corva/data.actual_survey/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields": "data.stations.inclination,data.stations.measured_depth",
  "limit": 1,
  "query": {
    "asset_id": 44307597
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/data.casing/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "asset_id": "$asset_id",
    "data.bottom_depth": "$data.bottom_depth",
    "data.outer_diameter": "$data.outer_diameter",
    "data.inner_diameter": "$data.inner_diameter",
    "data.is_exact_time": "$data.is_exact_time",
    "data.setting_timestamp": "$data.setting_timestamp",
    "data.start_timestamp": "$data.start_timestamp",
    "data.is_riser": "$data.is_riser"
  },
  "sort": {
    "timestamp": 1
  }
}
```

#### `GET /api/v1/data/corva/data.drillstring/`
- **Status codes:** 200
- **Record counts:** 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "query": {
    "asset_id": 44307597
  },
  "sort": {
    "data.id": -1
  }
}
```

#### `GET /api/v1/data/corva/data.drillstring/aggregate/`
- **Status codes:** 200
- **Record counts:** 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "start_depth": "$data.start_depth",
    "end_depth": "$data.end_depth",
    "index": "$data.id",
    "name": "$data.name"
  },
  "sort": {
    "data.start_depth": 1
  }
}
```

#### `GET /api/v1/data/corva/data.formations/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields": "data.md,data.td,data.formation_name",
  "limit": 1000,
  "query": {
    "asset_id": 44307597
  },
  "sort": {
    "data.md": 1
  }
}
```

#### `GET /api/v1/data/corva/data.formations/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "md": "$data.md",
    "td": "$data.td",
    "name": "$data.formation_name"
  },
  "sort": {
    "data.md": 1
  }
}
```

#### `GET /api/v1/data/corva/data.offset_wells/`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1,
  "query": {
    "asset_id": 44307597
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/data.plan_survey/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "stations": "$data.stations"
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/data.well-sections/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "start_depth": "$data.top_depth",
    "end_depth": "$data.bottom_depth",
    "name": "$data.name"
  },
  "sort": {
    "data.top_depth": 1
  }
}
```

#### `GET /api/v1/data/corva/directional.slide-sheet/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "query": {
    "version": 2,
    "asset_id": 44307597
  },
  "sort": {
    "timestamp": -1
  },
  "version": 2
}
```

#### `GET /api/v1/data/corva/directional.slide-sheet/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1,
  "match": {
    "asset_id": 44307597,
    "version": 2
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/directional.toolface.summary-1ft/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields": "data.active_tool_face,data.gravity_tool_face_median,data.magnetic_tool_face_median,data.hole_depth,data.tool_face_median",
  "limit": 10000,
  "query": {
    "data.tool_face_median": {
      "$gte": -200
    },
    "asset_id": 44307597
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/directional.trend/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields": "data.tfo,data.motor_yield,data.dls",
  "limit": 1,
  "query": {
    "asset_id": 44307597
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/wcu_rule_mapping/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 100,
  "match": {
    "company_id": 3,
    "data.app_id": 1181
  },
  "project": {
    "app_id": "$data.app_id",
    "rule_id": "$data.wcu_rules.rule_id",
    "_id": 0
  },
  "sort": {
    "timestamp": 1
  }
}
```

#### `GET /api/v1/data/corva/wellness_alerts/`
- **Status codes:** 200
- **Record counts:** 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1,
  "query": {
    "asset_id": 44307597,
    "data.segment": "drilling",
    "timestamp": {
      "$lt": 1681102800
    }
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/wellness_alerts/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 100,
  "match": {
    "asset_id": {
      "$in": [
        44307597
      ]
    },
    "data.rule_id": {
      "$in": [
        "6298b193625d9cedb84a6494",
        "65ccda319d0e3f66554a6e15",
        "64b58af10993db774b04178a",
        "642e86cafe656f88cdaaa93d",
        "6298b197f36cfe70b358c1bd",
        "6298b197cc1c0d98b913df97",
        "6298b19790ff08a4afc30d2a",
        "6298b1962bd27225948ca411",
        "6298b1962b528783f8fe3952",
        "6298b1957b235ea0e29cec35",
        "6241cf2042dd1d1b70e4391b",
        "6267f9dec10a87348ae7be7f",
        "6241cf297ce603350dc1b925",
        "6241cf25f4b7cfddda04d722",
        "6241cf247ce603350dc1b91a",
        "6241cf246badd599894b153a",
        "6241cf23cf9f22499dc8de42",
        "6241cf2326436a51a2664394",
        "6241cf215d6dcaa77271ed0f"
      ]
    }
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/wellness_rule_settings/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1000,
  "match": {
    "company_id": 3,
    "data.rule_id": {
      "$in": [
        "6241cf2042dd1d1b70e4391b",
        "6298b1962bd27225948ca411",
        "6298b197f36cfe70b358c1bd",
        "6298b197cc1c0d98b913df97",
        "6298b19790ff08a4afc30d2a",
        "6267f9dec10a87348ae7be7f",
        "6241cf215d6dcaa77271ed0f",
        "6241cf23cf9f22499dc8de42",
        "642e86cafe656f88cdaaa93d",
        "6298b193625d9cedb84a6494",
        "6298b1957b235ea0e29cec35",
        "6241cf2326436a51a2664394",
        "6241cf247ce603350dc1b91a",
        "6241cf246badd599894b153a",
        "6241cf297ce603350dc1b925",
        "6298b1962b528783f8fe3952",
        "6241cf25f4b7cfddda04d722",
        "64b58af10993db774b04178a",
        "65ccda319d0e3f66554a6e15"
      ]
    }
  },
  "sort": {
    "ts_desc": 1
  }
}
```

#### `GET /api/v1/data/corva/wellness_scores/`
- **Status codes:** 200
- **Record counts:** 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "fields": "asset_id,data.overall_percent_change,data.overall_qc_score,data.segment",
  "limit": 1,
  "query": {
    "asset_id": 44307597,
    "data.segment": "drilling"
  },
  "sort": {
    "timestamp": -1
  }
}
```

#### `GET /api/v1/data/corva/wits.summary-1m/aggregate/`
- **Status codes:** 200
- **Record counts:** 0, 0, 0, 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "limit": 1,
  "match": {
    "asset_id": 44307597
  },
  "project": {
    "hole_depth": "$data.hole_depth"
  },
  "sort": {
    "timestamp": -1
  }
}
```

### Host: `package.corva.ai`

#### `GET /corva/app/directional_plan_vs_actual.ui/packages/1046/app.js`
- **Status codes:** 304
- **Record counts:** 0
- **Seen in:** rotationaltendencies

#### `GET /corva/app/directional_surveys_and_projections.ui/packages/1906/app.js`
- **Status codes:** 304
- **Record counts:** 0
- **Seen in:** rotationaltendencies

#### `GET /corva/app/slide_sheet.ui/packages/163/app.js`
- **Status codes:** 200
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

### Host: `subscriptions.corva.ai`

#### `GET /socket.io/`
- **Status codes:** 101
- **Record counts:** 0, 0
- **Seen in:** rotationaltendencies

**Parameters:**
```json
{
  "EIO": 4,
  "transport": "websocket"
}
```

---
## 2. Dataset Catalog

| Dataset | Provider | Host(s) | Param Style | Sources | Avg Records |
|---------|----------|---------|-------------|---------|-------------|
| `corva/data.actual_survey` | corva | data_api | standard_query | rotationaltendencies | — |
| `corva/data.casing` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/data.drillstring` | corva | data_api | match_limit, standard_query | rotationaltendencies | — |
| `corva/data.formations` | corva | data_api | match_limit, standard_query | rotationaltendencies | — |
| `corva/data.offset_wells` | corva | data_api | standard_query | rotationaltendencies | — |
| `corva/data.plan_survey` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/data.well-sections` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/directional.slide-sheet` | corva | data_api | match_limit, standard_query | rotationaltendencies | — |
| `corva/directional.toolface.summary-1ft` | corva | data_api | standard_query | rotationaltendencies | — |
| `corva/directional.trend` | corva | data_api | standard_query | rotationaltendencies | — |
| `corva/wcu_rule_mapping` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/wellness_alerts` | corva | data_api | match_limit, standard_query | rotationaltendencies | — |
| `corva/wellness_rule_settings` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/wellness_scores` | corva | data_api | standard_query | rotationaltendencies | — |
| `corva/wits` | corva | platform_api |  | rotationaltendencies | — |
| `corva/wits.summary-1m` | corva | data_api | match_limit | rotationaltendencies | — |
| `corva/wits.summary-30m` | corva | platform_api |  | rotationaltendencies | — |
| `platform/assets` | platform | platform_api | ids_fields | rotationaltendencies | — |
| `platform/users` | platform | platform_api |  | rotationaltendencies | — |
| `platform/wells` | platform | platform_api | ids_fields | rotationaltendencies | — |

**Requested fields:** `data.stations.inclination, data.stations.measured_depth`

**Requested fields:** `data.formation_name, data.md, data.td`

**Requested fields:** `data.active_tool_face, data.gravity_tool_face_median, data.hole_depth, data.magnetic_tool_face_median, data.tool_face_median`

**Requested fields:** `data.dls, data.motor_yield, data.tfo`

**Requested fields:** `asset_id, data.overall_percent_change, data.overall_qc_score, data.segment`

**Requested fields:** `data.bit_depth, data.hole_depth`

**Requested fields:** `data.bit_depth, data.hole_depth, timestamp`

---
## 3. Metrics Key Catalog (0 keys)

| Key | Type | Array Len | Sample Value | Sources |
|-----|------|-----------|-------------|---------|

---
## 4. Component Family Field Inventory (0 families)

---
## 5. Well / Asset Metadata

No /v2/assets responses captured in the HAR files.

---
## 6. API Host Routing Summary

This table shows which API client to use for each dataset.

| Dataset | `corvaAPI` (api.corva.ai) | `corvaDataAPI` (data.corva.ai) | Param Style |
|---------|:-------------------------:|:------------------------------:|-------------|
| `corva/data.actual_survey` | — | ✅ | standard_query |
| `corva/data.casing` | — | ✅ | match_limit |
| `corva/data.drillstring` | — | ✅ | match_limit, standard_query |
| `corva/data.formations` | — | ✅ | match_limit, standard_query |
| `corva/data.offset_wells` | — | ✅ | standard_query |
| `corva/data.plan_survey` | — | ✅ | match_limit |
| `corva/data.well-sections` | — | ✅ | match_limit |
| `corva/directional.slide-sheet` | — | ✅ | match_limit, standard_query |
| `corva/directional.toolface.summary-1ft` | — | ✅ | standard_query |
| `corva/directional.trend` | — | ✅ | standard_query |
| `corva/wcu_rule_mapping` | — | ✅ | match_limit |
| `corva/wellness_alerts` | — | ✅ | match_limit, standard_query |
| `corva/wellness_rule_settings` | — | ✅ | match_limit |
| `corva/wellness_scores` | — | ✅ | standard_query |
| `corva/wits` | ✅ | — |  |
| `corva/wits.summary-1m` | — | ✅ | match_limit |
| `corva/wits.summary-30m` | ✅ | — |  |
| `platform/assets` | ✅ | — | ids_fields |
| `platform/users` | ✅ | — |  |
| `platform/wells` | ✅ | — | ids_fields |

---
## 7. App Summary: rotationaltendencies

**Total datasets:** 20
**Total endpoints:** 55
**Total metric keys:** 0
**Total data structure families:** 0

---
## 8. Recommended TypeScript Interfaces (Derived from Real Data)

### Dataset Record Interfaces (auto-generated from responses)

---
## 9. Recommended manifest.json Datasets

```json
{
  "datasets": {
    "corva.data.actual_survey": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.casing": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.drillstring": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.formations": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.offset_wells": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.plan_survey": {
      "permissions": [
        "read"
      ]
    },
    "corva.data.well-sections": {
      "permissions": [
        "read"
      ]
    },
    "corva.directional.slide-sheet": {
      "permissions": [
        "read"
      ]
    },
    "corva.directional.toolface.summary-1ft": {
      "permissions": [
        "read"
      ]
    },
    "corva.directional.trend": {
      "permissions": [
        "read"
      ]
    },
    "corva.wcu_rule_mapping": {
      "permissions": [
        "read"
      ]
    },
    "corva.wellness_alerts": {
      "permissions": [
        "read"
      ]
    },
    "corva.wellness_rule_settings": {
      "permissions": [
        "read"
      ]
    },
    "corva.wellness_scores": {
      "permissions": [
        "read"
      ]
    },
    "corva.wits": {
      "permissions": [
        "read"
      ]
    },
    "corva.wits.summary-1m": {
      "permissions": [
        "read"
      ]
    },
    "corva.wits.summary-30m": {
      "permissions": [
        "read"
      ]
    }
  }
}
```

---
## 10. Fetch Function Templates (Copy-Paste Ready)

Based on the actual API patterns seen in the HAR files:

### `corva/data.actual_survey`
```typescript
// Uses corvaDataAPI (data.corva.ai) with standard query params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.actual_survey/', {
  limit: 10000,
  sort: JSON.stringify({ timestamp: -1 }),
  query: JSON.stringify({ asset_id: assetId }),
});
```

### `corva/data.casing`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.casing/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/data.drillstring`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.drillstring/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/data.formations`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.formations/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/data.offset_wells`
```typescript
// Uses corvaDataAPI (data.corva.ai) with standard query params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.offset_wells/', {
  limit: 10000,
  sort: JSON.stringify({ timestamp: -1 }),
  query: JSON.stringify({ asset_id: assetId }),
});
```

### `corva/data.plan_survey`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.plan_survey/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/data.well-sections`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/data.well-sections/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/directional.slide-sheet`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/directional.slide-sheet/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/directional.toolface.summary-1ft`
```typescript
// Uses corvaDataAPI (data.corva.ai) with standard query params
const resp = await corvaDataAPI.get('/api/v1/data/corva/directional.toolface.summary-1ft/', {
  limit: 10000,
  sort: JSON.stringify({ timestamp: -1 }),
  query: JSON.stringify({ asset_id: assetId }),
});
```

### `corva/directional.trend`
```typescript
// Uses corvaDataAPI (data.corva.ai) with standard query params
const resp = await corvaDataAPI.get('/api/v1/data/corva/directional.trend/', {
  limit: 10000,
  sort: JSON.stringify({ timestamp: -1 }),
  query: JSON.stringify({ asset_id: assetId }),
});
```

### `corva/wcu_rule_mapping`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/wcu_rule_mapping/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/wellness_alerts`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/wellness_alerts/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/wellness_rule_settings`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/wellness_rule_settings/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/wellness_scores`
```typescript
// Uses corvaDataAPI (data.corva.ai) with standard query params
const resp = await corvaDataAPI.get('/api/v1/data/corva/wellness_scores/', {
  limit: 10000,
  sort: JSON.stringify({ timestamp: -1 }),
  query: JSON.stringify({ asset_id: assetId }),
});
```

### `corva/wits`

### `corva/wits.summary-1m`
```typescript
// Uses corvaDataAPI (data.corva.ai) with match/limit params
const resp = await corvaDataAPI.get('/api/v1/data/corva/wits.summary-1m/aggregate/', {
  limit: 10000,
  match: JSON.stringify({ company_id: companyId, 'data.asset_id': { $in: assetIds } }),
});
```

### `corva/wits.summary-30m`

---
## 11. App Cloning Roadmap

This roadmap is auto-generated from the extracted architecture of **rotationaltendencies**.
Follow these steps to recreate or clone this app into a new Corva UI app.

### Step 1: Create a New Corva UI App
1. Go to Corva Dev Center → Create New App → UI App
2. Set app key (e.g. `copca.your-new-app.ui`)
3. Choose segments: `drilling` (or as needed)
4. Copy the generated scaffold to your workspace

### Step 2: Configure `manifest.json` Datasets
Add these dataset permissions to your `manifest.json`:
```json
"datasets": {
  "corva.corva.data.actual_survey": { "permissions": ["read"] },
  "corva.corva.data.casing": { "permissions": ["read"] },
  "corva.corva.data.drillstring": { "permissions": ["read"] },
  "corva.corva.data.formations": { "permissions": ["read"] },
  "corva.corva.data.offset_wells": { "permissions": ["read"] },
  "corva.corva.data.plan_survey": { "permissions": ["read"] },
  "corva.corva.data.well-sections": { "permissions": ["read"] },
  "corva.corva.directional.slide-sheet": { "permissions": ["read"] },
  "corva.corva.directional.toolface.summary-1ft": { "permissions": ["read"] },
  "corva.corva.directional.trend": { "permissions": ["read"] },
  "corva.corva.wcu_rule_mapping": { "permissions": ["read"] },
  "corva.corva.wellness_alerts": { "permissions": ["read"] },
  "corva.corva.wellness_rule_settings": { "permissions": ["read"] },
  "corva.corva.wellness_scores": { "permissions": ["read"] },
  "corva.corva.wits": { "permissions": ["read"] },
  "corva.corva.wits.summary-1m": { "permissions": ["read"] },
  "corva.corva.wits.summary-30m": { "permissions": ["read"] },
  "corva.platform.assets": { "permissions": ["read"] },
  "corva.platform.users": { "permissions": ["read", "write"] },
  "corva.platform.wells": { "permissions": ["read"] },
}
```

### Step 3: Set Up API Clients
Your app uses these API hosts:
- `api.corva.ai` → use `corvaAPI`
- `app.beta.corva.ai` → use `corvaAPI`
- `data.corva.ai` → use `corvaDataAPI`
- `package.corva.ai` → use `corvaAPI`
- `subscriptions.corva.ai` → use `corvaAPI`

Create an API module (e.g. `src/api/corvaApi.ts`) with typed fetch functions.
See **Section 10** for copy-paste ready fetch templates.

### Step 4: Implement Data Fetching Hooks
Create React hooks for each dataset group:

- `useCorvaDataActualSurvey()` → fetches `corva/data.actual_survey`
- `useCorvaDataCasing()` → fetches `corva/data.casing`
- `useCorvaDataDrillstring()` → fetches `corva/data.drillstring`
- `useCorvaDataFormations()` → fetches `corva/data.formations`
- `useCorvaDataOffsetWells()` → fetches `corva/data.offset_wells`
- `useCorvaDataPlanSurvey()` → fetches `corva/data.plan_survey`
- `useCorvaDataWellSections()` → fetches `corva/data.well-sections`
- `useCorvaDirectionalSlideSheet()` → fetches `corva/directional.slide-sheet`
- `useCorvaDirectionalToolfaceSummary1ft()` → fetches `corva/directional.toolface.summary-1ft`
- `useCorvaDirectionalTrend()` → fetches `corva/directional.trend`
- `useCorvaWcuRuleMapping()` → fetches `corva/wcu_rule_mapping`
- `useCorvaWellnessAlerts()` → fetches `corva/wellness_alerts`
- `useCorvaWellnessRuleSettings()` → fetches `corva/wellness_rule_settings`
- `useCorvaWellnessScores()` → fetches `corva/wellness_scores`
- `useCorvaWits()` → fetches `corva/wits`
- `useCorvaWitsSummary1m()` → fetches `corva/wits.summary-1m`
- `useCorvaWitsSummary30m()` → fetches `corva/wits.summary-30m`
- `usePlatformAssets()` → fetches `platform/assets`
- `usePlatformUsers()` → fetches `platform/users`
- `usePlatformWells()` → fetches `platform/wells`

See **Section 8** for TypeScript interfaces to type the responses.

### Step 5: Implement User Settings
This app uses the following user settings keys:
- `offset_well_picker_5_settings_v1`
- `singleAsset`

Use `corvaAPI.post('/v1/users/{userId}/settings', { offset_well_picker_5_settings_v1, singleAsset })` to save.
Use `corvaAPI.get('/v1/users/{userId}/settings')` to load.

### Step 6: Dashboard Integration
The source app runs on dashboard slug: `506436/data_filters`
Your new app will need its own dashboard or be added to an existing one.
The app receives rig/well context via URL params: rigId, wellAssetId, rigAssetId

### Step 7: Test & Deploy
1. Run `yarn dev` to test locally
2. Run `yarn zip` to build the deployment package
3. Upload to Corva Dev Center
4. Add to a dashboard and verify all data loads correctly

---
## 12. Data Flow Summary

```
┌─────────────────────────────────────────────────────────┐
│                    CORVA PLATFORM                       │
├─────────────────────┬───────────────────────────────────┤
│   api.corva.ai      │      data.corva.ai               │
│   (Platform API)    │      (Data API)                   │
└─────────┬───────────┴──────────┬────────────────────────┘
          │                      │
          │  Platform Endpoints:  │  Data Endpoints:
          │  GET /options/
          │  GET /v1/companies
          │  GET /v1/data/corva/wits
          │  GET /v1/data/corva/wits.summary-30m
          │  GET /v1/notifications
          │  GET /v1/notifications/count/unread
          │  GET /v1/users/13324/dashboards/506436/data_f
          │  PUT /v1/users/13324/dashboards/519411/dashbo
          │                      │
          │                      │  GET /api/v1/data/corva/data.actual_survey/
          │                      │  GET /api/v1/data/corva/data.casing/aggregate
          │                      │  GET /api/v1/data/corva/data.drillstring/
          │                      │  GET /api/v1/data/corva/data.drillstring/aggr
          │                      │  GET /api/v1/data/corva/data.formations/
          │                      │  GET /api/v1/data/corva/data.formations/aggre
          │                      │  GET /api/v1/data/corva/data.offset_wells/
          │                      │  GET /api/v1/data/corva/data.plan_survey/aggr
          │                      │  GET /api/v1/data/corva/data.well-sections/ag
          │                      │  GET /api/v1/data/corva/directional.slide-she
          │                      │  GET /api/v1/data/corva/directional.slide-she
          │                      │  GET /api/v1/data/corva/directional.toolface.
          │                      │
          ▼                      ▼
┌─────────────────────────────────────────────────────────┐
│                   YOUR APP (UI)                         │
├─────────────────────────────────────────────────────────┤
│  Datasets consumed:                                     │
│    • corva/data.actual_survey                            │
│    • corva/data.casing                                   │
│    • corva/data.drillstring                              │
│    • corva/data.formations                               │
│    • corva/data.offset_wells                             │
│    • corva/data.plan_survey                              │
│    • corva/data.well-sections                            │
│    • corva/directional.slide-sheet                       │
│    • corva/directional.toolface.summary-1ft              │
│    • corva/directional.trend                             │
│    • corva/wcu_rule_mapping                              │
│    • corva/wellness_alerts                               │
│    • corva/wellness_rule_settings                        │
│    • corva/wellness_scores                               │
│    • corva/wits                                          │
│    • corva/wits.summary-1m                               │
│    • corva/wits.summary-30m                              │
│    • platform/assets                                     │
│    • platform/users                                      │
│    • platform/wells                                      │
│  User settings:                                         │
│    • offset_well_picker_5_settings_v1                    │
│    • singleAsset                                         │
└─────────────────────────────────────────────────────────┘
```
