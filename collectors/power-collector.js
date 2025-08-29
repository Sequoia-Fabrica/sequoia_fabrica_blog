#!/usr/bin/env node
// collectors/power-collector.js
// Collects power, system metrics, and AXP20x PMIC data to JSONL format

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

// ---------- CONFIG ----------
const LOGS_DIR = "/var/log/monitoring";
const POWER_LOG_PATH = path.join(LOGS_DIR, "power_metrics.jsonl");
const ESP32_LOG_PATH = '/var/log/esp_logger/esp_log.jsonl'
// TODO: update to use path.join(LOGS_DIR, "esp_log.jsonl"); (@orban)

// Power supply paths
const AX_AC_DIR = "/sys/class/power_supply/axp20x-ac";
const AX_BAT_DIR = "/sys/class/power_supply/axp20x-battery";
const CPU_TEMP_PATH = "/sys/class/thermal/thermal_zone0/temp";

// Constants
const PMIC_LOSS_FRAC = 0.0; // Efficiency loss in PMIC (tune as needed)

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

async function readUevent(dir) {
  if (!(await fileExists(dir))) {
    return {};
  }
  const uePath = path.join(dir, "uevent");
  try {
    const txt = await fsp.readFile(uePath, "utf8");
    const out = {};
    for (const line of txt.split("\n")) {
      const [k, v] = line.split("=");
      if (!k || v === undefined) {
        continue;
      }
      out[k.trim()] = v.trim();
    }
    return out;
  } catch {
    return {};
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
// For example, v_uV means voltage in microvolts.
// For example, i_mA means current in milliamperes.
// For example, p_mW means power in milliwatts.
// For example, soc means state of charge in percentage.
// For example, status means battery status in string.
// For example, ac_V means AC voltage in volts.
// For example, ac_A means AC current in amperes.
// For example, ac_W means AC power in watts.
// For example, p_in_W means input power in watts.
// For example, load_W means load power in watts.
// For example, cpu_temp_C means CPU temperature in Celsius.



function parseAxInput(ue) {
  // Units are µV/µA in AXP20x uevents
  const present = ue.POWER_SUPPLY_PRESENT === "1";
  const online = ue.POWER_SUPPLY_ONLINE === "1";
  const v_uV = safeFloat(ue.POWER_SUPPLY_VOLTAGE_NOW, 1); // µV (raw from sysfs)
  const i_uA = safeFloat(ue.POWER_SUPPLY_CURRENT_NOW, 1); // µA (raw from sysfs)
  const p_uW = present && online ? (v_uV * i_uA) * 1e-6 : 0; // µW (µV * µA * 1e-6 = µW)
  return { present, online, v_uV, i_uA, p_uW };
}

function parseAxBattery(ue) {
  // Units are µV/µA in AXP20x battery uevents
  const present = ue.POWER_SUPPLY_PRESENT === "1";
  const v_uV = safeFloat(ue.POWER_SUPPLY_VOLTAGE_NOW, 1); // µV (raw from sysfs)
  const i_uA = safeFloat(ue.POWER_SUPPLY_CURRENT_NOW, 1); // µA (raw from sysfs, charging > 0)
  const p_uW = present ? (v_uV * i_uA) * 1e-6 : 0; // µW (µV * µA * 1e-6 = µW)
  const capacity = safeFloat(ue.POWER_SUPPLY_CAPACITY, 1); // percentage
  const status = ue.POWER_SUPPLY_STATUS || "unknown";
  return { present, v_uV, i_uA, p_uW, capacity, status };
}

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
    //          "soc": 0.707640348, "status": "discharging"}
    // Note: i is in A, p is in W, v is in V
    return {
      timestamp: espMetrics.ts,
      milliseconds: espMetrics.ms,
      unsynced: espMetrics.unsynced,
      v_V: espMetrics.v, // Battery voltage from shunt monitor
      i_mA: espMetrics.i * 1000, // Current in A, convert to mA
      p_mW: espMetrics.p * 1000, // Power in W, convert to mW 
      sh_mV: espMetrics.sh_mV,
      q_C: espMetrics.q_C, // Charge in coulombs
      e_J: espMetrics.e_J, // Energy in joules
      soc: espMetrics.soc, // 0-1 fraction
      status: espMetrics.status
    };
  } catch (error) {
    console.warn("Failed to read ESP32 metrics:", error.message);
    return null;
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
    const uptime = os.uptime(); // seconds since process start
    const cpuTemp = await getCpuTemperature();
    const cpuLoadAvg = os.loadavg(); // Returns [1min, 5min, 15min] averages

    // Read AXP20x data
    const acUE = await readUevent(AX_AC_DIR);
    const ac = parseAxInput(acUE);

    const batUE = await readUevent(AX_BAT_DIR);
    const axpBattery = parseAxBattery(batUE);

    // Read ESP32 shunt monitor data
    const esp32Metrics = await getLatestESP32Metrics();

    // Calculate power metrics
    const p_in_W = ac.p_uW * 1e-6 * (1 - PMIC_LOSS_FRAC);
    // Use AXP chip for current load since it accounts for leakage current
    const p_load_W = p_in_W > 0.5 ? p_in_W - axpBattery.p_uW * 1e-6 : -axpBattery.p_uW * 1e-6;

    // Create metrics record
    const metrics = {
      ts: timestamp,
      ms: Date.now(),

      // Power metrics - AXP20x PMIC readings
      axp_batt_v_V: axpBattery.v_uV * 1e-6, // AXP20x battery voltage in V
      axp_batt_i_mA: axpBattery.i_uA * 1e-3, // AXP20x battery current in mA (positive = charging)
      axp_batt_p_mW: axpBattery.p_uW * 1e-3, // AXP20x battery power in mW

      // ESP32 shunt monitor readings (if available)
      esp32_v_V: esp32Metrics ? esp32Metrics.v_V : null, // ESP32 shunt voltage in V
      esp32_i_mA: esp32Metrics ? esp32Metrics.i_mA : null, // ESP32 shunt current in mA
      esp32_p_mW: esp32Metrics ? esp32Metrics.p_mW : null, // ESP32 shunt power in mW
      esp32_soc: esp32Metrics ? esp32Metrics.soc : null, // ESP32 SOC as 0-1 fraction
      soc: esp32Metrics ? esp32Metrics.soc : axpBattery.capacity / 100, // Main SOC: prefer ESP32, fallback to AXP
      status: esp32Metrics ? esp32Metrics.status : axpBattery.status,

      // System metrics
      ac_V: ac.v_uV * 1e-6,
      ac_A: ac.i_uA * 1e-6,
      ac_W: ac.p_uW * 1e-6,
      p_in_W: p_in_W,
      load_W: p_load_W,

      // System info
      uptime: uptime,
      cpu_temp_c: cpuTemp,
      cpu_load_1min: cpuLoadAvg[0],
      cpu_load_5min: cpuLoadAvg[1],
      cpu_load_15min: cpuLoadAvg[2],

      // AXP backup battery
      axp_batt_capacity: axpBattery.capacity,
      axp_batt_present: axpBattery.present,
      axp_soc: axpBattery.capacity / 100 // AXP SOC as 0-1 fraction for reference
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
    if (metrics) {
      await appendToJsonl(POWER_LOG_PATH, metrics);
      console.log(`Power metrics logged: ${metrics.ts}`);
    } else {
      console.error("Failed to collect metrics");
      process.exitCode = 1;
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