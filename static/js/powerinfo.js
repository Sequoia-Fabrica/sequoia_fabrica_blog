// static/js/powerinfo.js
// Fuses AXP20x PMIC sysfs + INA228 shunt JSONL to report:
//  - Adapter input power (AC)
//  - Battery V/I/P/SOC (charging > 0)
//  - System load power (what the computer actually uses)
//  - CPU temperature and load average
//  - Staleness flags to avoid UI whiplash

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");

// ---------- CONFIG ----------
const AX_AC_DIR = "/sys/class/power_supply/axp20x-ac";
const AX_BAT_DIR = "/sys/class/power_supply/axp20x-battery";
const SHUNT_LOG_PATH = "/var/log/esp_logger/esp_log.jsonl"; // INA228 JSONL (latest line)
const SHUNT_MAX_BYTES = 128 * 1024; // tail window
const SHUNT_MAX_AGE_MS = 20_000; // consider stale after 20s
const PMIC_LOSS_FRAC = 0.0; // start at 0; tune later (0.02..0.05)
const CPU_TEMP_PATH = "/sys/class/thermal/thermal_zone0/temp"; // CPU temperature path

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

// Tail the last valid JSON line from a JSONL file.
// Reads at most maxBytes from the end to keep it lightweight.
async function tailJsonl(filePath, maxBytes = SHUNT_MAX_BYTES) {
  if (!(await fileExists(filePath))) {
    return null;
  }
  const stat = await fsp.stat(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = await fsp.open(filePath, "r");
  try {
    const { buffer } = await fd.read({
      position: start,
      length: stat.size - start,
      buffer: Buffer.alloc(stat.size - start),
    });
    const lines = buffer.toString("utf8").trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj && typeof obj === "object") {
          return obj;
        }
      } catch {}
    }
    return null;
  } finally {
    await fd.close();
  }
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
  return { present, V, A, P, capacity };
}

function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) {
    return "0.00";
  }
  return n.toFixed(digits);
}

function msNow() {
  return Date.now();
}

// Helper function to read CPU temperature
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

// ---------- CORE ----------
async function getPowerInfo() {
  const t0 = msNow();

  // Get server uptime
  const uptime = os.uptime(); // seconds since process start
  const uptimeFormatted = formatUptime(uptime);

  // Get CPU temperature and load average
  const cpuTemp = await getCpuTemperature();
  const cpuLoadAvg = os.loadavg(); // Returns [1min, 5min, 15min] averages

  // Read AXP20x (AC)
  const acUE = await readUevent(AX_AC_DIR);
  const ac = parseAxInput(acUE);

  // Read AXP20x (Battery)
  const batUE = await readUevent(AX_BAT_DIR);
  const axpBattery = parseAxBattery(batUE);

  // Total adapter input (what PMIC ingests)
  const p_in_W = ac.P * (1 - PMIC_LOSS_FRAC);

  // Read latest INA228 shunt line
  const shunt = await tailJsonl(SHUNT_LOG_PATH);
  let shunt_V = 0,
    shunt_A = 0,
    shunt_W = 0,
    soc = null,
    shunt_ts = null,
    shunt_stale_ms = null,
    status = "unknown";

  if (shunt) {
    // Expected keys from your firmware:
    // v (V), i (mA, charging > 0), p (mW, signed), soc (0..1), ts (ISO), ms (monotonic)
    shunt_V = safeFloat(shunt.v, 1);
    shunt_A = safeFloat(shunt.i, 1000); // mA -> A
    shunt_W = safeFloat(shunt.p, 1000); // mW -> W
    if (typeof shunt.soc === "number") {
      soc = Math.max(0, Math.min(1, shunt.soc));
    }
    shunt_ts = shunt.ts || null;

    // Staleness: prefer monotonic ms if present, else wall time delta
    if (typeof shunt.ms === "number") {
      // ms is device-local monotonic since boot; treat as fresh if it changed recently
      shunt_stale_ms = 0; // unknown drift; we only know we have "a" latest sample
    } else if (shunt_ts) {
      const tParsed = Date.parse(shunt_ts);
      shunt_stale_ms = Number.isFinite(tParsed) ? msNow() - tParsed : null;
    }

    // Status from signed battery power
    if (shunt_V > 13.5) {
      status = "charging";
    } else if (shunt_V < 13.5) {
      status = "discharging";
    }
  }

  // Compute system load
  // If shunt is present and fresh enough → p_load = p_in - p_shunt
  // If shunt missing/stale but adapter online → best-effort p_load = p_in
  // If off-grid (no adapter) and shunt present → p_load ≈ -p_shunt
  const shuntFresh =
    shunt_stale_ms === null || shunt_stale_ms < SHUNT_MAX_AGE_MS;
  let p_load_W = null;

  if (shunt && shuntFresh) {
    p_load_W = p_in_W - shunt_W;
  } else if (p_in_W > 0.5) {
    p_load_W = p_in_W;
  } else if (shunt) {
    p_load_W = -shunt_W;
  }

  // Render-friendly fields
  const out = {
    // meta
    local_time: new Date().toLocaleString(),
    gen_ms: msNow() - t0,
    uptime: uptimeFormatted,

    // CPU information
    cpu_temp_c: cpuTemp,
    cpu_load_1min: cpuLoadAvg[0],
    cpu_load_5min: cpuLoadAvg[1],
    cpu_load_15min: cpuLoadAvg[2],

    // adapter input (AC)
    ac_V: ac.V,
    ac_A: ac.A,
    ac_W: ac.P,
    p_in_W,

    // AXP20x battery
    axp_batt_V: axpBattery.V,
    axp_batt_A: axpBattery.A,
    axp_batt_W: axpBattery.P,
    axp_batt_capacity: axpBattery.capacity,

    // shunt readings
    shunt_V,
    shunt_A,
    shunt_W,
    soc_pct: soc === null ? null : Math.round(soc * 100),
    status, // charging|discharging|idle|unknown
    shunt_ts,
    shunt_stale_ms,

    // derived system load
    load_W: p_load_W,
  };

  // Also provide formatted strings for templates that want ready-to-print values
  out.fmt = {
    cpu: {
      temp: cpuTemp === null ? "—" : `${fmt(cpuTemp, 1)}°C`,
      load_1min: fmt(cpuLoadAvg[0], 2),
      load_5min: fmt(cpuLoadAvg[1], 2),
      load_15min: fmt(cpuLoadAvg[2], 2),
    },
    ac: { V: fmt(out.ac_V), A: fmt(out.ac_A, 3), W: fmt(out.ac_W) },
    in_W: fmt(out.p_in_W),
    axp_batt: {
      V: fmt(out.axp_batt_V, 3),
      A: fmt(out.axp_batt_A, 3),
      W: out.axp_batt_W >= 0 ? `+${fmt(out.axp_batt_W)}` : fmt(out.axp_batt_W),
      capacity:
        out.axp_batt_capacity == null
          ? "—"
          : `${Math.round(out.axp_batt_capacity)}%`,
    },
    shunt: {
      V: fmt(out.shunt_V, 3),
      A: fmt(out.shunt_A, 3),
      W: out.shunt_W >= 0 ? `+${fmt(out.shunt_W)}` : fmt(out.shunt_W),
    },
    load_W: out.load_W == null ? "—" : fmt(out.load_W),
    soc: out.soc_pct == null ? "—" : `${out.soc_pct}%`,
    status: out.status,
  };

  return out;
}

// Helper function to format uptime in a human-readable format
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

module.exports = { getPowerInfo };
