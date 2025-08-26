# Data Collectors

This directory contains the monitoring data collection system for the Sequoia Fabrica solar-powered website.

## Overview

The collectors gather real-time data from various sources and generate JSON API files that power the website's live dashboard and power monitoring features. The system is designed to run autonomously via systemd timers, logging all data to `/var/log/monitoring/` for persistence and analysis.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Power Sources  │    │  Weather APIs   │    │  Calendar APIs  │
│  (AXP20x/INA)  │    │  (BrightSky)    │    │   (BookWhen)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ power-collector │    │weather-collector│    │calendar-collector│
│   (every 5min)  │    │  (every 60min)  │    │  (every 60min)  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
    ┌─────────────────────────────────────────────────────────┐
    │              /var/log/monitoring/                       │
    │  power_metrics.jsonl | weather_cache.jsonl | calendar_cache.jsonl │
    └─────────────────────┬───────────────────────────────────┘
                          │
                          ▼
                ┌─────────────────┐
                │data-orchestrator│
                │  (every 2min)   │
                └─────────┬───────┘
                          │
                          ▼
                ┌─────────────────┐
                │ /var/www/html/  │
                │     /api/       │
                │ stats.json      │
                │ weather.json    │
                │ calendar.json   │
                └─────────────────┘
```

## Collectors

### power-collector.js

**Purpose**: Collects real-time power system metrics from hardware sensors

**Data Sources**:
- AXP20x PMIC (`/sys/class/power_supply/axp20x-ac`, `/sys/class/power_supply/axp20x-battery`)
- CPU thermal sensors (`/sys/class/thermal/thermal_zone0/temp`)
- System load averages (`os.loadavg()`)

**Output**: `/var/log/monitoring/power_metrics.jsonl`

**Schedule**: Every 5 minutes

**Key Metrics**:
- Battery voltage, current, power, and state of charge (SOC)
- AC input power and status
- System power consumption calculations
- CPU temperature and load averages
- System uptime

### weather-collector.js

**Purpose**: Fetches weather forecast data for solar power prediction

**Data Sources**:
- BrightSky API (San Francisco weather station)
- Uses existing `../static/js/weather.js` module

**Output**: `/var/log/monitoring/weather_cache.jsonl`

**Schedule**: Every 60 minutes

**Key Data**:
- 3-day weather forecast with icons
- Conditions relevant to solar power generation
- API response caching with error handling

### calendar-collector.js

**Purpose**: Collects upcoming events from the makerspace calendar

**Data Sources**:
- BookWhen ICS feed (`http://feeds.bookwhen.com/ical/x3ixm04f5wj7/yf23z4/public.ics`)
- Uses existing `../static/js/parse_calendar.js` module

**Output**: `/var/log/monitoring/calendar_cache.jsonl`

**Schedule**: Every 60 minutes

**Key Features**:
- Filters events to next 3 months
- Sorts chronologically
- Handles ICS parsing and date processing

## Data Orchestrator

### data-orchestrator.js

**Purpose**: Aggregates all collector data and generates web-accessible JSON APIs

**Input Sources**:
- `/var/log/monitoring/power_metrics.jsonl`
- `/var/log/monitoring/weather_cache.jsonl`
- `/var/log/monitoring/calendar_cache.jsonl`

**Output Files**:
- `/var/www/html/api/stats.json` - Power and system statistics
- `/var/www/html/api/weather.json` - Weather forecast data
- `/var/www/html/api/calendar.json` - Upcoming events

**Schedule**: Every 2 minutes

**Key Functions**:
- Reads most recent data from each JSONL log
- Generates 24-hour sparkline data (288 5-minute buckets)
- Creates comprehensive stats object compatible with frontend
- Atomic file writes to prevent corrupted reads
- Handles missing or invalid data gracefully

## Data Format

### Power Metrics (JSONL)
```json
{
  "ts": "2025-08-26T02:25:58.276Z",
  "ms": 1756175158276,
  "v": 4.504,
  "i": 0,
  "p": 0,
  "soc": 1.0,
  "status": "Full",
  "ac_v": 5.1,
  "ac_a": 0.288,
  "ac_w": 1.47,
  "p_in_w": 1.47,
  "load_w": 1.47,
  "uptime": 1468800,
  "cpu_temp_c": 36.6,
  "cpu_load_15min": 0.15
}
```

### API Output (stats.json)
```json
{
  "local_time": "25/08/2025, 19:27:05",
  "uptime": "17d 0h 25m",
  "load_W": 1.47,
  "soc_pct": 100,
  "status": "Full",
  "cpu_temp_c": 36.6,
  "sparklines": {
    "timestamps": [1756175100000],
    "voltage": [4.504],
    "powerUsage": [1.47],
    "mainBattery": [100]
  },
  "fmt": {
    "soc": "100%",
    "status": "Full"
  }
}
```

## Installation

See `systemd/README.md` for complete deployment instructions including:
- System user setup
- Directory permissions
- Systemd service installation
- Monitoring commands

## Dependencies

- Node.js runtime
- Existing Hugo site modules:
  - `../static/js/weather.js`
  - `../static/js/parse_calendar.js`
- System access to:
  - `/sys/class/power_supply/` (AXP20x sensors)
  - `/sys/class/thermal/` (CPU temperature)
  - Network access for API calls

## Error Handling

All collectors include comprehensive error handling:
- Graceful degradation when sensors are unavailable
- Network timeout and retry logic for API calls
- Atomic file operations to prevent data corruption
- Detailed logging to systemd journal
- Non-zero exit codes on failure for systemd monitoring