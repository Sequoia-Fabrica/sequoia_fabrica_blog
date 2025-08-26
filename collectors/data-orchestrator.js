#!/usr/bin/env node
// collectors/data-orchestrator.js
// Aggregates data from all collectors and generates static JSON files for nginx

const path = require("path");
const fsp = require("fs/promises");
const fs = require("fs");
const os = require("os");

// Import collector modules
const powerCollector = require("./power-collector.js");
const weatherCollector = require("./weather-collector.js");
const calendarCollector = require("./calendar-collector.js");

// ---------- CONFIG ----------
const API_DIR = process.env.API_DIR || "/var/www/html/api";
const STATS_FILE = path.join(API_DIR, "stats.json");
const WEATHER_FILE = path.join(API_DIR, "weather.json");
const CALENDAR_FILE = path.join(API_DIR, "calendar.json");

// Sparkline configuration for 24-hour window
const SPARKLINE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const SPARKLINE_BUCKET_MS = 5 * 60 * 1000; // 5-minute buckets (288 buckets per day)

// ---------- HELPERS ----------
const fileExists = async (p) => {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

async function ensureDirectoryExists(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

async function writeFileAtomic(destPath, data) {
  const dir = path.dirname(destPath);
  const tmp = path.join(dir, `.tmp.${process.pid}.${Date.now()}`);

  await ensureDirectoryExists(dir);
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, destPath);
}

const safeFloat = (v, s = 1) => {
  const n = Number(v);
  return Number.isFinite(n) ? n / s : 0;
};

const fmt = (n, digits = 2) => {
  if (!Number.isFinite(n)) {
    return "0.00";
  }
  return n.toFixed(digits);
};

// ---------- POWER DATA PROCESSING ----------

// Read recent power metrics from JSONL file for sparkline generation
async function getSparklineDataFromPowerLog() {
  try {
    if (!(await fileExists(powerCollector.POWER_LOG_PATH))) {
      return createEmptySparklineData();
    }

    const now = Date.now();
    const cutoffTime = now - SPARKLINE_WINDOW_MS;

    // Read recent data from JSONL file
    const stat = await fsp.stat(powerCollector.POWER_LOG_PATH);
    const readSize = Math.min(stat.size, 2 * 1024 * 1024); // Read last 2MB max
    const start = Math.max(0, stat.size - readSize);

    const fd = await fsp.open(powerCollector.POWER_LOG_PATH, "r");
    let buffer;
    try {
      const result = await fd.read({
        position: start,
        length: readSize,
        buffer: Buffer.alloc(readSize),
      });
      buffer = result.buffer;
    } finally {
      await fd.close();
    }

    const lines = buffer.toString("utf8").trim().split("\n").filter(Boolean);
    const buckets = new Map();

    // Process JSONL lines into time buckets
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const timestamp = entry.ms || Date.parse(entry.ts);

        if (!timestamp || timestamp < cutoffTime) continue;

        const bucketTime =
          Math.floor(timestamp / SPARKLINE_BUCKET_MS) * SPARKLINE_BUCKET_MS;

        if (!buckets.has(bucketTime)) {
          buckets.set(bucketTime, {
            count: 0,
            sums: {
              v: 0, i: 0, p: 0, soc: 0, load_w: 0,
              cpu_temp: 0, cpu_load: 0, axp_capacity: 0,
              // ESP32 specific sums
              esp32_v: 0, esp32_i: 0, esp32_p: 0, esp32_soc: 0,
              // AXP specific sums  
              axp_v: 0, axp_i: 0, axp_p: 0, axp_soc: 0
            },
          });
        }

        const bucket = buckets.get(bucketTime);
        // Legacy fields (for backward compatibility)
        bucket.sums.v += safeFloat(entry.v, 1) || 0;
        bucket.sums.i += safeFloat(entry.i, 1000) || 0; // mA to A  
        bucket.sums.p += safeFloat(entry.p, 1000) || 0; // mW to W
        bucket.sums.soc += safeFloat(entry.soc, 1) * 100 || 0; // to percentage
        bucket.sums.load_w += safeFloat(entry.load_w, 1) || 0;
        bucket.sums.cpu_temp += safeFloat(entry.cpu_temp_c, 1) || 0;
        bucket.sums.cpu_load += safeFloat(entry.cpu_load_15min, 1) || 0;
        bucket.sums.axp_capacity += safeFloat(entry.axp_capacity || entry.axp_batt_capacity, 1) || 0;
        
        // ESP32 specific data
        if (entry.esp32_v !== undefined) {
          bucket.sums.esp32_v += safeFloat(entry.esp32_v, 1) || 0;
          bucket.sums.esp32_i += safeFloat(entry.esp32_i, 1000) || 0; // mA to A
          bucket.sums.esp32_p += safeFloat(entry.esp32_p, 1000) || 0; // mW to W
          bucket.sums.esp32_soc += safeFloat(entry.esp32_soc, 1) * 100 || 0; // to percentage
        }
        
        // AXP specific data  
        if (entry.axp_v !== undefined) {
          bucket.sums.axp_v += safeFloat(entry.axp_v, 1) || 0;
          bucket.sums.axp_i += safeFloat(entry.axp_i, 1000) || 0; // mA to A
          bucket.sums.axp_p += safeFloat(entry.axp_p, 1000) || 0; // mW to W
          bucket.sums.axp_soc += safeFloat(entry.axp_soc, 1) * 100 || 0; // to percentage
        }
        
        bucket.count++;
      } catch (e) {
        continue; // Skip malformed entries
      }
    }

    // Convert to sparkline format
    const sortedBuckets = Array.from(buckets.entries()).sort(
      (a, b) => a[0] - b[0]
    );

    return {
      timestamps: sortedBuckets.map(([time]) => time),
      voltage: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? bucket.sums.v / bucket.count : 0
      ),
      currentDraw: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? Math.abs(bucket.sums.i) / bucket.count : 0
      ),
      powerUsage: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? Math.abs(bucket.sums.load_w) / bucket.count : 0
      ),
      mainBattery: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? bucket.sums.soc / bucket.count : 0
      ),
      cpuTemp: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? bucket.sums.cpu_temp / bucket.count : 0
      ),
      cpuLoad: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? bucket.sums.cpu_load / bucket.count : 0
      ),
      backupBattery: sortedBuckets.map(([, bucket]) =>
        bucket.count > 0 ? bucket.sums.axp_capacity / bucket.count : 0
      ),
    };
  } catch (error) {
    console.warn("Failed to analyze power log for sparklines:", error.message);
    return createEmptySparklineData();
  }
}

function createEmptySparklineData() {
  return {
    timestamps: [],
    voltage: [],
    currentDraw: [],
    powerUsage: [],
    mainBattery: [],
    cpuTemp: [],
    cpuLoad: [],
    backupBattery: [],
  };
}

// Get the most recent power metrics from JSONL
async function getLatestPowerMetrics() {
  try {
    if (!(await fileExists(powerCollector.POWER_LOG_PATH))) {
      return null;
    }

    const data = await fsp.readFile(powerCollector.POWER_LOG_PATH, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);

    // Look for the most recent valid entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry && typeof entry === 'object' && entry.ts) {
          return entry;
        }
      } catch { }
    }
    return null;
  } catch (error) {
    console.warn("Failed to read power metrics:", error.message);
    return null;
  }
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

// ---------- DATA AGGREGATION ----------

async function generateStatsJson() {
  try {
    console.log("Generating stats.json...");

    // Get latest power metrics
    const powerMetrics = await getLatestPowerMetrics();

    if (!powerMetrics) {
      console.warn("No power metrics available");
      return {
        local_time: new Date().toLocaleString(),
        error: "No power data available",
        uptime: "—"
      };
    }

    // Calculate derived values
    const loadW = powerMetrics.load_W || 0;
    const axpBattV = powerMetrics.axp_batt_v_V || 0;
    const esp32V = powerMetrics.esp32_v_V || null;
    const socPct = Math.round((powerMetrics.soc || 0) * 100);

    // Get sparkline data
    const sparklines = await getSparklineDataFromPowerLog();

    // Create comprehensive stats object compatible with existing frontend
    const stats = {
      // Meta information
      local_time: new Date().toLocaleString(),
      gen_ms: Date.now() - Date.parse(powerMetrics.ts),
      uptime: formatUptime(powerMetrics.uptime || 0),

      // Power metrics
      load_W: loadW,
      p_in_W: powerMetrics.p_in_W || 0,
      W: loadW, // Alternative name used by frontend

      // Battery metrics - AXP20x PMIC
      axp_batt_v_V: axpBattV,
      axp_batt_i_A: powerMetrics.axp_batt_i_mA / 1000, // Convert mA to A
      
      // Battery metrics - ESP32 shunt monitor
      esp32_v_V: esp32V,
      esp32_i_A: powerMetrics.esp32_i_mA ? powerMetrics.esp32_i_mA / 1000 : null, // Convert mA to A
      soc_pct: socPct,
      status: powerMetrics.status || "unknown",

      // AXP20x metrics
      axp_batt_capacity: powerMetrics.axp_batt_capacity || 0,

      // System metrics
      cpu_temp_c: powerMetrics.cpu_temp_c,
      cpu_load_15min: powerMetrics.cpu_load_15min,

      // Sparkline data
      sparklines: sparklines,

      // Formatted values for templates
      fmt: {
        cpu: {
          temp: powerMetrics.cpu_temp_c !== null ? `${fmt(powerMetrics.cpu_temp_c, 1)}°C` : "—",
          load_15min: fmt(powerMetrics.cpu_load_15min || 0, 2),
        },
        soc: socPct > 0 ? `${socPct}%` : "—",
        status: powerMetrics.status || "—"
      }
    };

    return stats;

  } catch (error) {
    console.error("Failed to generate stats:", error.message);
    return {
      local_time: new Date().toLocaleString(),
      error: error.message,
      uptime: "—"
    };
  }
}

// Get the most recent weather data from JSONL
async function getLatestWeatherData() {
  try {
    if (!(await fileExists(weatherCollector.WEATHER_LOG_PATH))) {
      return null;
    }

    const data = await fsp.readFile(weatherCollector.WEATHER_LOG_PATH, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);

    // Look for the most recent valid entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry && typeof entry === 'object' && entry.success && entry.data) {
          return entry.data;
        }
      } catch { }
    }
    return null;
  } catch (error) {
    console.warn("Failed to read weather data:", error.message);
    return null;
  }
}

async function generateWeatherJson() {
  try {
    console.log("Generating weather.json...");
    const weatherData = await getLatestWeatherData();
    return weatherData || {
      today_icon: "",
      tomorrow_icon: "",
      day_after_t_icon: ""
    };
  } catch (error) {
    console.error("Failed to generate weather data:", error.message);
    return {
      today_icon: "",
      tomorrow_icon: "",
      day_after_t_icon: ""
    };
  }
}

// Get the most recent calendar data from JSONL
async function getLatestCalendarData() {
  try {
    if (!(await fileExists(calendarCollector.CALENDAR_LOG_PATH))) {
      return null;
    }

    const data = await fsp.readFile(calendarCollector.CALENDAR_LOG_PATH, 'utf8');
    const lines = data.trim().split('\n').filter(Boolean);

    // Look for the most recent valid entry
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry && typeof entry === 'object' && entry.success && entry.data) {
          return entry.data;
        }
      } catch { }
    }
    return null;
  } catch (error) {
    console.warn("Failed to read calendar data:", error.message);
    return null;
  }
}

async function generateCalendarJson() {
  try {
    console.log("Generating calendar.json...");
    const calendarData = await getLatestCalendarData();
    return Array.isArray(calendarData) ? calendarData : [];
  } catch (error) {
    console.error("Failed to generate calendar data:", error.message);
    return [];
  }
}

// ---------- MAIN ----------
async function main() {
  try {
    console.log("Data orchestrator starting...");

    // Generate all data files in parallel
    const [statsData, weatherData, calendarData] = await Promise.all([
      generateStatsJson(),
      generateWeatherJson(),
      generateCalendarJson()
    ]);

    // Write JSON files atomically
    await Promise.all([
      writeFileAtomic(STATS_FILE, JSON.stringify(statsData)),
      writeFileAtomic(WEATHER_FILE, JSON.stringify(weatherData)),
      writeFileAtomic(CALENDAR_FILE, JSON.stringify(calendarData))
    ]);

    console.log(`Data files updated:`);
    console.log(`  - ${STATS_FILE}`);
    console.log(`  - ${WEATHER_FILE}`);
    console.log(`  - ${CALENDAR_FILE}`);

  } catch (error) {
    console.error("Data orchestrator failed:", error.message);
    process.exitCode = 1;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateStatsJson,
  generateWeatherJson,
  generateCalendarJson,
  main
};