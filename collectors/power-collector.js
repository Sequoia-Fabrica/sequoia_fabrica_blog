#!/usr/bin/env node
// collectors/power-collector.js
// Collects power and system metrics from ESP32 shunt monitor to JSONL format

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

// ---------- CONFIG ----------
const LOGS_DIR = "/var/lib/monitoring";
const POWER_LOG_PATH = path.join(LOGS_DIR, "power_metrics.jsonl");
const ESP32_LOG_PATH = path.join(LOGS_DIR, "esp_log.jsonl");

// System sensor paths
const CPU_TEMP_PATH = "/sys/class/thermal/thermal_zone0/temp";

// ---------- HELPERS ----------
const safeFloat = (v, s = 1) => {
  const n = Number(v);
  return Number.isFinite(n) ? n / s : 0;
};

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

async function getCpuTemperature() {
  try {
    if (await fileExists(CPU_TEMP_PATH)) {
      const tempData = await fsp.readFile(CPU_TEMP_PATH, "utf8");
      const tempMilliCelsius = parseInt(tempData.trim(), 10);
      if (Number.isFinite(tempMilliCelsius)) {
        return tempMilliCelsius / 1000; // Convert to Celsius
      }
    }
  } catch (error) {
    console.warn("Failed to read CPU temperature:", error.message);
  }
  return null;
}

// We use the following naming convention for metrics: {name}_{unit}.
// For example, v_V means voltage in volts.
// For example, i_mA means current in milliamperes.
// For example, p_mW means power in milliwatts.
// For example, p_W means power in watts.
// For example, soc means state of charge as 0-1 fraction.
// For example, status means battery status string.
// For example, load_W means load power in watts.
// For example, p_in_W means input power (solar) in watts.
// For example, cpu_temp_c means CPU temperature in Celsius.

async function getLatestESP32Metrics() {
  try {
    if (!(await fileExists(ESP32_LOG_PATH))) {
      console.warn("ESP32 log file not found:", ESP32_LOG_PATH);
      return null;
    }

    // Read the last line of the ESP32 log file
    const data = await fsp.readFile(ESP32_LOG_PATH, "utf8");
    const lines = data.trim().split("\n");
    const lastLine = lines[lines.length - 1];

    if (!lastLine) {
      return null;
    }

    const espMetrics = JSON.parse(lastLine);

    // Return parsed ESP32 metrics
    // Format: {"ms": 264403221, "ts": "2025-08-26T05:33:09Z", "unsynced": true,
    //          "v": 13.29688, "i": -0.04583979893, "p": -0.6095260764,
    //          "sh_mV": -0.034379849, "q_C": -3324.947457, "e_J": -43369.46301,
    //          "soc": 0.707640348, "cv_ms": 0, "flt_ms": 0}
    // Note: i is in mA, p is in mW, v is in V
    return {
      timestamp: espMetrics.ts,
      milliseconds: espMetrics.ms,
      unsynced: espMetrics.unsynced,
      v_V: espMetrics.v, // Battery voltage from shunt monitor
      i_mA: espMetrics.i, // Current in mA
      p_mW: espMetrics.p, // Power in mW
      sh_mV: espMetrics.sh_mV,
      q_C: espMetrics.q_C, // Charge in coulombs
      e_J: espMetrics.e_J, // Energy in joules
      soc: espMetrics.soc, // 0-1 fraction
      cv_ms: espMetrics.cv_ms || 0, // CV phase dwell time
      flt_ms: espMetrics.flt_ms || 0 // Float phase dwell time
    };
  } catch (error) {
    console.warn("Failed to read ESP32 metrics:", error.message);
    return null;
  }
}

function deriveStatus(esp32Metrics) {
  // Derive battery status from ESP32 CV/float detection and current
  // Uses smart detection based on charge phase:
  // - CV (constant voltage) or Float phase = Full
  // - Positive current (>10mA) = Charging
  // - Negative current (<-10mA) = Discharging
  // - Near-zero current = Full

  if (!esp32Metrics) {
    return "Unknown";
  }

  const { i_mA, cv_ms, flt_ms } = esp32Metrics;

  // If in CV or float phase, battery is full
  if (cv_ms > 1000 || flt_ms > 1000) {
    return "Full";
  }

  // Check current direction
  if (i_mA > 10) {
    return "Charging";
  } else if (i_mA < -10) {
    return "Discharging";
  } else {
    // Near-zero current
    return "Full";
  }
}


async function appendToJsonl(filePath, data) {
  const jsonLine = JSON.stringify(data) + '\n';
  try {
    await fsp.appendFile(filePath, jsonLine);
  } catch (error) {
    console.error("Failed to append to JSONL:", error.message);
    throw error;
  }
}

// ---------- MAIN COLLECTION LOGIC ----------
async function collectPowerMetrics() {
  try {
    const timestamp = new Date().toISOString();
    const uptime = os.uptime(); // seconds since system boot
    const cpuTemp = await getCpuTemperature();
    const cpuLoadAvg = os.loadavg(); // Returns [1min, 5min, 15min] averages

    // Read ESP32 shunt monitor data
    const esp32Metrics = await getLatestESP32Metrics();

    if (!esp32Metrics) {
      // No ESP data yet - this is expected on first run while ESP logger accumulates data
      console.warn("No ESP32 metrics available yet - ESP logger may still be starting up");
      return { noDataYet: true };
    }

    // Calculate power metrics from shunt data
    // Load power: absolute value of shunt power (system consumption)
    const load_W = Math.abs(esp32Metrics.p_mW) / 1000;

    // Battery charge/discharge power (negative when discharging)
    const battery_p_W = esp32Metrics.p_mW / 1000;

    // Derive solar input power: load + battery charging power
    // When charging: p_in_W = load_W + battery_p_W (both positive)
    // When discharging: p_in_W = load_W + battery_p_W (battery_p_W is negative)
    const p_in_W = load_W + battery_p_W;

    // Derive status from CV/float detection and current
    const status = deriveStatus(esp32Metrics);

    // Create metrics record
    const metrics = {
      ts: timestamp,
      ms: Date.now(),

      // ESP32 shunt monitor readings
      esp32_v_V: esp32Metrics.v_V, // Battery voltage in V
      esp32_i_mA: esp32Metrics.i_mA, // Current in mA (positive = charging)
      esp32_p_mW: esp32Metrics.p_mW, // Power in mW (positive = charging)
      esp32_soc: esp32Metrics.soc, // SOC as 0-1 fraction

      // Main battery metrics
      soc: esp32Metrics.soc, // State of charge (0-1)
      status: status, // Charging/Discharging/Full

      // Power flow metrics
      p_in_W: Math.max(0, p_in_W), // Solar input power (derived, clamp to 0)
      load_W: load_W, // System load power

      // System info
      uptime: uptime,
      cpu_temp_c: cpuTemp,
      cpu_load_1min: cpuLoadAvg[0],
      cpu_load_5min: cpuLoadAvg[1],
      cpu_load_15min: cpuLoadAvg[2]
    };

    return metrics;
  } catch (error) {
    console.error("Failed to collect power metrics:", error.message);
    return null;
  }
}

// ---------- MAIN ----------
async function main() {
  try {
    // Ensure logs directory exists
    await ensureDirectoryExists(LOGS_DIR);


    // Collect metrics
    const metrics = await collectPowerMetrics();
    if (!metrics) {
      // Actual error occurred (caught in collectPowerMetrics)
      console.error("Failed to collect metrics");
      process.exitCode = 1;
    } else if (metrics.noDataYet) {
      // No ESP data available yet - this is expected on first run
      // Exit gracefully with code 0 (success)
      console.log("Skipping metrics collection - ESP data not yet available");
    } else {
      await appendToJsonl(POWER_LOG_PATH, metrics);
      console.log(`Power metrics logged: ${metrics.ts}`);
    }

  } catch (error) {
    console.error("Power collector failed:", error.message);
    process.exitCode = 1;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { collectPowerMetrics, POWER_LOG_PATH };