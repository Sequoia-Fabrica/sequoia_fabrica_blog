# Data Collectors

This directory contains the monitoring data collection system for the Sequoia Fabrica solar-powered website.

## Overview

The collectors gather real-time data from various sources and generate JSON API files that power the website's live dashboard and power monitoring features. The system runs on a Raspberry Pi server "sol" with:
- **esp_logger.py**: Continuous service reading battery data from ESP32 via USB serial
- **Collector timers**: Periodic jobs that process and cache data
- **Data orchestrator**: Aggregates all data into web-accessible JSON API files

All collector data is logged to `/var/log/collectors/` for persistence and analysis.

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ ESP32 + INA228  │    │  Weather APIs   │    │  Calendar APIs  │
│  (USB Serial)   │    │  (BrightSky)    │    │   (BookWhen)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      │                      │
┌─────────────────┐              │                      │
│  esp_logger.py  │              │                      │
│  (continuous)   │              │                      │
└─────────┬───────┘              │                      │
          │                      │                      │
          ▼                      │                      │
/var/log/esp_logger/             │                      │
   esp_log.jsonl                 │                      │
          │                      │                      │
          ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ power-collector │    │weather-collector│    │calendar-collector│
│   (every 5min)  │    │  (every 60min)  │    │  (every 60min)  │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          ▼                      ▼                      ▼
    ┌─────────────────────────────────────────────────────────┐
    │              /var/log/collectors/                       │
    │  power_metrics.jsonl | weather.json | calendar.json     │
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

### esp_logger.py

**Purpose**: Continuously reads battery data from ESP32 via USB serial

**Data Sources**:
- ESP32 microcontroller connected via USB serial (`/dev/ttyUSB0`)
- INA228 high-precision shunt sensor (voltage, current, power, charge, energy)

**Output**: `/var/log/esp_logger/esp_log.jsonl`

**Schedule**: Continuous (systemd service, not timer)

**Key Metrics**:
- Battery voltage (0-20V range)
- Current flow (positive = charging, negative = discharging)
- Power consumption/generation
- State of charge percentage
- Cumulative charge (coulombs) and energy (joules)

### power-collector.js

**Purpose**: Processes ESP logger data and adds system metrics

**Data Sources**:
- ESP logger output (`/var/log/esp_logger/esp_log.jsonl`)
- CPU thermal sensors (`/sys/class/thermal/thermal_zone0/temp`)
- System load averages (`os.loadavg()`)

**Output**: `/var/log/collectors/power_metrics.jsonl`

**Schedule**: Every 5 minutes

**Key Metrics**:
- Battery voltage, current, power, and state of charge (SOC)
- CPU temperature and load averages
- System uptime

### weather-collector.js

**Purpose**: Fetches weather forecast data for solar power prediction

**Data Sources**:
- BrightSky API (San Francisco weather station)
- Uses existing `../static/js/weather.js` module

**Output**: `/var/log/collectors/weather.json`

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

**Output**: `/var/log/collectors/calendar.json`

**Schedule**: Every 60 minutes

**Key Features**:
- Filters events to next 3 months
- Sorts chronologically
- Handles ICS parsing and date processing

## Data Orchestrator

### data-orchestrator.js

**Purpose**: Aggregates all collector data and generates web-accessible JSON APIs

**Input Sources**:
- `/var/log/collectors/power_metrics.jsonl`
- `/var/log/collectors/weather.json`
- `/var/log/collectors/calendar.json`

**Output Files**:
- `/var/www/html/api/stats.json` - Power and system statistics
- `/var/www/html/api/weather.json` - Weather forecast data
- `/var/www/html/api/calendar.json` - Upcoming events

**Schedule**: Every 2 minutes

**Key Functions**:
- Reads most recent data from each collector output
- Generates 24-hour sparkline data (288 5-minute buckets)
- Creates comprehensive stats object compatible with frontend
- Atomic file writes to prevent corrupted reads
- Handles missing or invalid data gracefully

## Data Format

### ESP Logger Output (esp_log.jsonl)
```json
{
  "ts": "2026-01-12T18:30:00.000Z",
  "voltage": 13.35,
  "current": 0.25,
  "power": 3.34,
  "soc": 99.0,
  "charge": 150000,
  "energy": 2000000,
  "shunt_voltage": 0.625
}
```

### Power Metrics (power_metrics.jsonl)
```json
{
  "ts": "2026-01-12T18:30:00.000Z",
  "ms": 1736706600000,
  "v": 13.35,
  "i": 0.25,
  "p": 3.34,
  "soc": 0.99,
  "status": "Charging",
  "uptime": 1468800,
  "cpu_temp_c": 42.5,
  "cpu_load_15min": 0.15
}
```

### API Output (stats.json)
```json
{
  "local_time": "12/01/2026, 10:30:00",
  "uptime": "17d 0h 25m",
  "load_W": 3.34,
  "soc_pct": 99,
  "status": "Charging",
  "cpu_temp_c": 42.5,
  "battery_v": 13.35,
  "sparklines": {
    "timestamps": [1736706600000],
    "voltage": [13.35],
    "powerUsage": [3.34],
    "mainBattery": [99]
  },
  "fmt": {
    "soc": "99%",
    "status": "Charging"
  }
}
```

## Installation

**Automated (Recommended)**: Infrastructure is deployed via Ansible. See `ansible/sol.yml` for the complete configuration. Push changes to the `ansible/` directory to trigger automatic deployment via GitHub Actions.

**Manual**: See `systemd/README.md` for manual deployment instructions including:
- System user setup
- Directory permissions
- Systemd service installation
- Monitoring commands

## Dependencies

- **Python 3** (for esp_logger.py)
  - pyserial (USB serial communication)
- **Node.js runtime** (for collectors)
  - Existing Hugo site modules: `../static/js/weather.js`, `../static/js/parse_calendar.js`
- **System access**:
  - `/dev/ttyUSB0` (ESP32 serial port)
  - `/sys/class/thermal/` (CPU temperature)
  - Network access for weather/calendar APIs

## Error Handling

All collectors include comprehensive error handling:
- Graceful degradation when sensors are unavailable
- Network timeout and retry logic for API calls
- Atomic file operations to prevent data corruption
- Detailed logging to systemd journal
- Non-zero exit codes on failure for systemd monitoring