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

// Time range configurations for sparklines
const TIME_RANGES = {
  '8h': {
    window_ms: 8 * 60 * 60 * 1000,       // 8 hours
    bucket_ms: 5 * 60 * 1000,             // 5-minute buckets (96 points)
    filename: 'stats-8h.json'
  },
  '24h': {
    window_ms: 24 * 60 * 60 * 1000,      // 24 hours
    bucket_ms: 5 * 60 * 1000,             // 5-minute buckets (288 points)
    filename: 'stats.json'                // Default file for backwards compatibility
  },
  '7d': {
    window_ms: 7 * 24 * 60 * 60 * 1000,  // 7 days
    bucket_ms: 15 * 60 * 1000,            // 15-minute buckets (672 points)
    filename: 'stats-7d.json'
  },
  '30d': {
    window_ms: 30 * 24 * 60 * 60 * 1000, // 30 days
    bucket_ms: 60 * 60 * 1000,            // 1-hour buckets (720 points)
    filename: 'stats-30d.json'
  }
};

// Default values for backwards compatibility
const SPARKLINE_WINDOW_MS = TIME_RANGES['24h'].window_ms;
const SPARKLINE_BUCKET_MS = TIME_RANGES['24h'].bucket_ms;

// ---------- HELPERS ----------
const fileExists = async (p) => {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read the last N bytes from a file to avoid loading large files into memory.
 * @param {string} filePath - Path to the file to read
 * @param {number} maxBytes - Maximum number of bytes to read (default 1MB)
 * @returns {Promise<string>} - The content as a UTF-8 string
 */
async function readLastBytes(filePath, maxBytes = 1024 * 1024) {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.size === 0) return '';

    const readSize = Math.min(stat.size, maxBytes);
    const start = Math.max(0, stat.size - readSize);

    const fd = await fsp.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(readSize);
      await fd.read(buffer, 0, readSize, start);
      return buffer.toString('utf8');
    } finally {
      await fd.close();
    }
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

/**
 * Get recent JSONL entries from a file using bounded reads.
 * Reads from the end of the file to avoid memory exhaustion on large files.
 * @param {string} filePath - Path to the JSONL file
 * @param {number} maxBytes - Maximum number of bytes to read (default 1MB)
 * @returns {Promise<Array>} - Array of parsed JSON objects
 */
async function getRecentJsonlEntries(filePath, maxBytes = 1024 * 1024) {
  const content = await readLastBytes(filePath, maxBytes);
  if (!content) return [];

  const lines = content.trim().split('\n');

  // First line might be partial if we didn't read from start, skip it
  const stat = await fsp.stat(filePath);
  if (stat.size > maxBytes && lines.length > 0) {
    lines.shift(); // Remove potentially partial first line
  }

  return lines.filter(Boolean).map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

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

  try {
    await ensureDirectoryExists(dir);

    // Write temporary file
    await fsp.writeFile(tmp, data, { mode: 0o644 });

    // Try to match ownership of existing file if it exists
    try {
      const destStat = await fsp.stat(destPath);
      await fsp.chown(tmp, destStat.uid, destStat.gid);
    } catch (e) {
      // File doesn't exist yet, that's ok
    }

    // Atomic rename
    await fsp.rename(tmp, destPath);

  } catch (error) {
    // Cleanup temp file on failure
    try {
      await fsp.unlink(tmp);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
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
// Parameters allow different time windows and bucket sizes for various time ranges
async function getSparklineDataFromPowerLog(windowMs = SPARKLINE_WINDOW_MS, bucketMs = SPARKLINE_BUCKET_MS) {
  const meta = {
    file_size_bytes: 0,
    total_lines: 0,
    parsed_entries: 0,
    entries_in_window: 0,
    bucket_count: 0,
    oldest_entry_ms: null,
    newest_entry_ms: null,
    window_start_ms: 0,
    window_end_ms: 0,
    window_ms: windowMs,
    bucket_ms: bucketMs,
    error: null
  };

  try {
    if (!(await fileExists(powerCollector.POWER_LOG_PATH))) {
      meta.error = "File not found";
      return { ...createEmptySparklineData(), meta };
    }

    const now = Date.now();
    const cutoffTime = now - windowMs;
    meta.window_start_ms = cutoffTime;
    meta.window_end_ms = now;

    // Read recent data from JSONL file
    const stat = await fsp.stat(powerCollector.POWER_LOG_PATH);
    meta.file_size_bytes = stat.size;

    // Scale read size based on window - larger windows need more data
    const baseReadSize = 2 * 1024 * 1024; // 2MB for 24h
    const windowDays = windowMs / (24 * 60 * 60 * 1000);
    const readSize = Math.min(stat.size, Math.ceil(baseReadSize * Math.max(1, windowDays)));
    const start = Math.max(0, stat.size - readSize);

    const fd = await fsp.open(powerCollector.POWER_LOG_PATH, "r");
    let buffer;
    let bytesRead = 0;
    try {
      const result = await fd.read({
        position: start,
        length: readSize,
        buffer: Buffer.alloc(readSize),
      });
      buffer = result.buffer;
      bytesRead = result.bytesRead;
    } finally {
      await fd.close();
    }

    // If we started reading mid-file, skip the first partial line
    let content = buffer.slice(0, bytesRead).toString("utf8");
    if (start > 0) {
      const firstNewline = content.indexOf("\n");
      if (firstNewline !== -1) {
        content = content.slice(firstNewline + 1);
      }
    }

    const lines = content.trim().split("\n").filter(Boolean);
    meta.total_lines = lines.length;

    const buckets = new Map();

    // Process JSONL lines into time buckets
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        meta.parsed_entries++;

        const timestamp = entry.ms || Date.parse(entry.ts);

        if (!timestamp) continue;

        // Track timestamp range in file
        if (meta.oldest_entry_ms === null || timestamp < meta.oldest_entry_ms) {
          meta.oldest_entry_ms = timestamp;
        }
        if (meta.newest_entry_ms === null || timestamp > meta.newest_entry_ms) {
          meta.newest_entry_ms = timestamp;
        }

        if (timestamp < cutoffTime) continue;

        meta.entries_in_window++;

        const bucketTime =
          Math.floor(timestamp / bucketMs) * bucketMs;

        if (!buckets.has(bucketTime)) {
          buckets.set(bucketTime, {
            count: 0,
            sums: {
              v: 0, i: 0, p: 0, soc: 0, load_w: 0,
              cpu_temp: 0, cpu_load: 0
            },
          });
        }

        const bucket = buckets.get(bucketTime);
        // ESP32 shunt monitor data
        bucket.sums.v += safeFloat(entry.esp32_v_V, 1) || 0; // Battery voltage
        bucket.sums.i += safeFloat(entry.esp32_i_mA, 1) || 0; // Current in mA
        bucket.sums.p += safeFloat(entry.esp32_p_mW, 1) || 0; // Power in mW
        bucket.sums.soc += safeFloat(entry.soc, 1) * 100 || 0; // Battery SOC to percentage
        bucket.sums.load_w += safeFloat(entry.load_W, 1) || 0; // Load power from shunt
        bucket.sums.cpu_temp += safeFloat(entry.cpu_temp_c, 1) || 0;
        bucket.sums.cpu_load += safeFloat(entry.cpu_load_15min, 1) || 0;

        bucket.count++;
      } catch (e) {
        continue; // Skip malformed entries
      }
    }

    meta.bucket_count = buckets.size;

    // Convert to sparkline format
    const sortedBuckets = Array.from(buckets.entries()).sort(
      (a, b) => a[0] - b[0]
    );

    // Calculate averages across all buckets for the time range
    const calcAverage = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const voltageData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? bucket.sums.v / bucket.count : 0
    );
    const currentDrawData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? Math.abs(bucket.sums.i) / bucket.count : 0
    );
    const powerUsageData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? Math.abs(bucket.sums.load_w) / bucket.count : 0
    );
    const mainBatteryData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? bucket.sums.soc / bucket.count : 0
    );
    const cpuTempData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? bucket.sums.cpu_temp / bucket.count : 0
    );
    const cpuLoadData = sortedBuckets.map(([, bucket]) =>
      bucket.count > 0 ? bucket.sums.cpu_load / bucket.count : 0
    );

    return {
      timestamps: sortedBuckets.map(([time]) => time),
      voltage: voltageData,
      currentDraw: currentDrawData,
      powerUsage: powerUsageData,
      mainBattery: mainBatteryData,
      cpuTemp: cpuTempData,
      cpuLoad: cpuLoadData,
      // Time-range averages for display values
      averages: {
        voltage: calcAverage(voltageData),
        currentDraw: calcAverage(currentDrawData),
        powerUsage: calcAverage(powerUsageData),
        mainBattery: calcAverage(mainBatteryData),
        cpuTemp: calcAverage(cpuTempData),
        cpuLoad: calcAverage(cpuLoadData)
      },
      meta
    };
  } catch (error) {
    console.warn("Failed to analyze power log for sparklines:", error.message);
    meta.error = error.message;
    return { ...createEmptySparklineData(), meta };
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
    averages: null
  };
}

// Get the most recent power metrics from JSONL (with bounded read)
async function getLatestPowerMetrics() {
  try {
    if (!(await fileExists(powerCollector.POWER_LOG_PATH))) {
      return null;
    }

    // Use bounded read to avoid memory exhaustion
    const entries = await getRecentJsonlEntries(powerCollector.POWER_LOG_PATH, 512 * 1024); // 512KB should be plenty for recent entries

    // Look for the most recent valid entry
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && typeof entry === 'object' && entry.ts) {
        return entry;
      }
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

async function generateStatsJson(timeRangeKey = '24h') {
  const timeRange = TIME_RANGES[timeRangeKey] || TIME_RANGES['24h'];

  try {
    console.log(`Generating ${timeRange.filename} (${timeRangeKey})...`);

    // Get latest power metrics
    const powerMetrics = await getLatestPowerMetrics();

    if (!powerMetrics) {
      console.warn("No power metrics available");
      return {
        local_time: new Date().toLocaleString(),
        time_range: timeRangeKey,
        error: "No power data available",
        uptime: "—"
      };
    }

    // Calculate derived values
    const loadW = powerMetrics.load_W || 0;
    const esp32V = powerMetrics.esp32_v_V || 0;
    const socPct = Math.round((powerMetrics.soc || 0) * 100);

    // Get sparkline data for the specified time range
    const sparklineResult = await getSparklineDataFromPowerLog(
      timeRange.window_ms,
      timeRange.bucket_ms
    );
    const { meta: sparklineMeta, averages: rangeAverages, ...sparklines } = sparklineResult;

    // Log sparkline stats for debugging
    if (sparklineMeta) {
      console.log(`  Sparkline stats: ${sparklineMeta.bucket_count} buckets from ${sparklineMeta.entries_in_window}/${sparklineMeta.parsed_entries} entries`);
      if (sparklineMeta.oldest_entry_ms && sparklineMeta.newest_entry_ms) {
        const ageHours = (Date.now() - sparklineMeta.oldest_entry_ms) / (1000 * 60 * 60);
        console.log(`  Data range: ${ageHours.toFixed(1)} hours old to now`);
      }
    }

    // For 24h (default), use latest metrics; for other ranges, use time-range averages
    const useAverages = timeRangeKey !== '24h' && rangeAverages;
    const displayLoadW = useAverages ? rangeAverages.powerUsage : loadW;
    const displayVoltage = useAverages ? rangeAverages.voltage : esp32V;
    const displayCurrentmA = useAverages ? rangeAverages.currentDraw : Math.abs(powerMetrics.esp32_i_mA || 0);
    const displayCpuTemp = useAverages ? rangeAverages.cpuTemp : powerMetrics.cpu_temp_c;
    const displayCpuLoad = useAverages ? rangeAverages.cpuLoad : powerMetrics.cpu_load_15min;
    const displaySocPct = useAverages ? Math.round(rangeAverages.mainBattery) : socPct;

    // Data freshness: how old is the last power metric entry?
    const dataAgeMs = Date.now() - (powerMetrics.ms || Date.parse(powerMetrics.ts));
    const dataAgeSec = Math.round(dataAgeMs / 1000);
    const dataStale = dataAgeSec > 900; // stale if older than 15 minutes

    if (dataStale) {
      const ageHours = (dataAgeSec / 3600).toFixed(1);
      console.warn(`Power data is ${ageHours} hours old — power-collector may have stopped`);
    }

    // Create comprehensive stats object
    const stats = {
      // Meta information
      local_time: new Date().toLocaleString(),
      time_range: timeRangeKey,
      gen_ms: dataAgeMs,
      uptime: formatUptime(os.uptime()),
      data_age_s: dataAgeSec,
      data_stale: dataStale,

      // Power metrics (averages for non-24h ranges)
      load_W: displayLoadW,
      p_in_W: powerMetrics.p_in_W || 0,

      // Battery metrics - ESP32 shunt monitor (averages for non-24h ranges)
      esp32_v_V: displayVoltage,
      esp32_i_mA: displayCurrentmA,
      esp32_i_A: displayCurrentmA / 1000,
      soc_pct: displaySocPct,
      status: powerMetrics.status || "Unknown",

      // System metrics (averages for non-24h ranges)
      cpu_temp_c: displayCpuTemp,
      cpu_load_15min: displayCpuLoad,

      // Sparkline data
      sparklines: sparklines,

      // Sparkline metadata for debugging
      sparkline_meta: sparklineMeta,

      // Time-range averages (always included for reference)
      range_averages: rangeAverages || null,

      // Formatted values for templates (using display values)
      fmt: {
        cpu: {
          temp: displayCpuTemp !== null ? `${fmt(displayCpuTemp, 1)}°C` : "—",
          load_15min: fmt(displayCpuLoad || 0, 2),
        },
        soc: displaySocPct > 0 ? `${displaySocPct}%` : "—",
        status: powerMetrics.status || "—"
      }
    };

    return stats;

  } catch (error) {
    console.error(`Failed to generate stats for ${timeRangeKey}:`, error.message);
    return {
      local_time: new Date().toLocaleString(),
      time_range: timeRangeKey,
      error: error.message,
      uptime: "—"
    };
  }
}

// Get the most recent weather data from JSONL (with bounded read)
async function getLatestWeatherData() {
  try {
    if (!(await fileExists(weatherCollector.WEATHER_LOG_PATH))) {
      return null;
    }

    // Use bounded read to avoid memory exhaustion
    const entries = await getRecentJsonlEntries(weatherCollector.WEATHER_LOG_PATH, 256 * 1024); // 256KB

    // Look for the most recent valid entry
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && typeof entry === 'object' && entry.success && entry.data) {
        return entry.data;
      }
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

// Get the most recent calendar data from JSONL (with bounded read)
async function getLatestCalendarData() {
  try {
    if (!(await fileExists(calendarCollector.CALENDAR_LOG_PATH))) {
      return null;
    }

    // Use bounded read to avoid memory exhaustion
    const entries = await getRecentJsonlEntries(calendarCollector.CALENDAR_LOG_PATH, 256 * 1024); // 256KB

    // Look for the most recent valid entry
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry && typeof entry === 'object' && entry.success && entry.data) {
        return entry.data;
      }
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

    // Generate stats for all time ranges in parallel
    const timeRangeKeys = Object.keys(TIME_RANGES);
    const statsPromises = timeRangeKeys.map(key => generateStatsJson(key));

    // Generate all data files in parallel
    const [statsDataArray, weatherData, calendarData] = await Promise.all([
      Promise.all(statsPromises),
      generateWeatherJson(),
      generateCalendarJson()
    ]);

    // Write all stats files for different time ranges
    const statsWritePromises = timeRangeKeys.map((key, index) => {
      const filePath = path.join(API_DIR, TIME_RANGES[key].filename);
      return writeFileAtomic(filePath, JSON.stringify(statsDataArray[index]));
    });

    // Write all JSON files atomically
    await Promise.all([
      ...statsWritePromises,
      writeFileAtomic(WEATHER_FILE, JSON.stringify(weatherData)),
      writeFileAtomic(CALENDAR_FILE, JSON.stringify(calendarData))
    ]);

    console.log(`Data files updated:`);
    for (const key of timeRangeKeys) {
      console.log(`  - ${path.join(API_DIR, TIME_RANGES[key].filename)}`);
    }
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
  TIME_RANGES,
  main
};