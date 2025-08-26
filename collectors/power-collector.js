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

function parseAxInput(ue) {
  // Units are µV/µA in AXP20x uevents
  const present = ue.POWER_SUPPLY_PRESENT === "1";
  const online = ue.POWER_SUPPLY_ONLINE === "1";
  const V = safeFloat(ue.POWER_SUPPLY_VOLTAGE_NOW, 1e6); // V
  const A = safeFloat(ue.POWER_SUPPLY_CURRENT_NOW, 1e6); // A
  const P = present && online ? V * A : 0; // W
  return { present, online, V, A, P };
}

function parseAxBattery(ue) {
  // Units are µV/µA in AXP20x battery uevents
  const present = ue.POWER_SUPPLY_PRESENT === "1";
  const V = safeFloat(ue.POWER_SUPPLY_VOLTAGE_NOW, 1e6); // V
  const A = safeFloat(ue.POWER_SUPPLY_CURRENT_NOW, 1e6); // A (charging > 0)
  const P = present ? V * A : 0; // W
  const capacity = safeFloat(ue.POWER_SUPPLY_CAPACITY, 1); // percentage
  const status = ue.POWER_SUPPLY_STATUS || "unknown";
  return { present, V, A, P, capacity, status };
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

    // Calculate power metrics
    const p_in_W = ac.P * (1 - PMIC_LOSS_FRAC);
    const p_load_W = p_in_W > 0.5 ? p_in_W - axpBattery.P : -axpBattery.P;

    // Create metrics record
    const metrics = {
      ts: timestamp,
      ms: Date.now(),

      // Power metrics (compatible with existing ESP log format)
      v: axpBattery.V, // Battery voltage
      i: axpBattery.A * 1000, // Battery current in mA (positive = charging)
      p: axpBattery.P * 1000, // Battery power in mW
      soc: axpBattery.capacity / 100, // SOC as 0-1 fraction
      status: axpBattery.status,

      // System metrics
      ac_v: ac.V,
      ac_a: ac.A,
      ac_w: ac.P,
      p_in_w: p_in_W,
      load_w: p_load_W,

      // System info
      uptime: uptime,
      cpu_temp_c: cpuTemp,
      cpu_load_1min: cpuLoadAvg[0],
      cpu_load_5min: cpuLoadAvg[1],
      cpu_load_15min: cpuLoadAvg[2],

      // AXP backup battery
      axp_batt_capacity: axpBattery.capacity,
      axp_batt_present: axpBattery.present
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