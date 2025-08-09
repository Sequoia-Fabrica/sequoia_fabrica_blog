// static/js/powerinfo.js
// Fuses AXP20x PMIC sysfs + INA228 shunt JSONL to report:
//  - Adapter input power (AC/USB)
//  - Battery V/I/P/SOC (charging > 0)
//  - System load power (what the computer actually uses)
//  - Staleness flags to avoid UI whiplash

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

// ---------- CONFIG ----------
const AX_AC_DIR = "/sys/class/power_supply/axp20x-ac";
const AX_USB_DIR = "/sys/class/power_supply/axp20x-usb"; // may not exist
const AX_BAT_DIR = "/sys/class/power_supply/axp20x-battery"; // optional for cross-check
const SHUNT_LOG_PATH = "/var/log/esp_logger/esp_log.jsonl"; // INA228 JSONL (latest line)
const SHUNT_MAX_BYTES = 128 * 1024; // tail window
const SHUNT_MAX_AGE_MS = 20_000; // consider stale after 20s
const PMIC_LOSS_FRAC = 0.0; // start at 0; tune later (0.02..0.05)

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

function fmt(n, digits = 2) {
  if (!Number.isFinite(n)) {
    return "0.00";
  }
  return n.toFixed(digits);
}

function msNow() {
  return Date.now();
}

// ---------- CORE ----------
async function getPowerInfo() {
  const t0 = msNow();

  // Read AXP20x (AC)
  const acUE = await readUevent(AX_AC_DIR);
  const ac = parseAxInput(acUE);

  // Read AXP20x (USB) if present
  let usb = { present: false, online: false, V: 0, A: 0, P: 0 };
  if (await fileExists(AX_USB_DIR)) {
    const usbUE = await readUevent(AX_USB_DIR);
    usb = parseAxInput(usbUE);
  }

  // Optionally read battery uevent for cross-check (not needed for fused math)
  let axBat = {};
  if (await fileExists(AX_BAT_DIR)) {
    axBat = await readUevent(AX_BAT_DIR);
  }

  // Total adapter input (what PMIC ingests)
  const p_in_W = (ac.P + usb.P) * (1 - PMIC_LOSS_FRAC);

  // Read latest INA228 shunt line
  const shunt = await tailJsonl(SHUNT_LOG_PATH);
  let batt_V = 0,
    batt_A = 0,
    batt_W = 0,
    soc = null,
    shunt_ts = null,
    shunt_stale_ms = null,
    status = "unknown";

  if (shunt) {
    // Expected keys from your firmware:
    // v (V), i (mA, charging > 0), p (mW, signed), soc (0..1), ts (ISO), ms (monotonic)
    batt_V = safeFloat(shunt.v, 1);
    batt_A = safeFloat(shunt.i, 1000); // mA -> A
    batt_W = safeFloat(shunt.p, 1000); // mW -> W
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
    if (batt_W > +0.2) {
      status = "charging";
    } else if (batt_W < -0.2) {
      status = "discharging";
    } else {
      status = "idle";
    }
  }

  // Compute system load
  // If shunt is present and fresh enough → p_load = p_in - p_batt
  // If shunt missing/stale but adapter online → best-effort p_load = p_in
  // If off-grid (no adapter) and shunt present → p_load ≈ -p_batt
  const shuntFresh =
    shunt_stale_ms === null || shunt_stale_ms < SHUNT_MAX_AGE_MS;
  let p_load_W = null;

  if (shunt && shuntFresh) {
    p_load_W = p_in_W - batt_W;
  } else if (p_in_W > 0.5) {
    p_load_W = p_in_W;
  } else if (shunt) {
    p_load_W = -batt_W;
  }

  // Render-friendly fields
  const out = {
    // meta
    local_time: new Date().toISOString(),
    gen_ms: msNow() - t0,

    // adapter inputs
    ac_V: ac.V,
    ac_A: ac.A,
    ac_W: ac.P,
    usb_V: usb.V,
    usb_A: usb.A,
    usb_W: usb.P,
    p_in_W,

    // battery via shunt
    batt_V, // V
    batt_A, // A (charging > 0)
    batt_W, // W (signed)
    soc_pct: soc === null ? null : Math.round(soc * 100),
    status, // charging|discharging|idle|unknown
    shunt_ts,
    shunt_stale_ms,

    // derived system load
    load_W: p_load_W,

    // optional PMIC battery (if exposed): voltage_now/current_now are µ units
    axp_batt_V: safeFloat(axBat.POWER_SUPPLY_VOLTAGE_NOW, 1e6) || null,
    axp_batt_A: safeFloat(axBat.POWER_SUPPLY_CURRENT_NOW, 1e6) || null,
  };

  // Also provide formatted strings for templates that want ready-to-print values
  out.fmt = {
    ac: { V: fmt(out.ac_V), A: fmt(out.ac_A, 3), W: fmt(out.ac_W) },
    usb: { V: fmt(out.usb_V), A: fmt(out.usb_A, 3), W: fmt(out.usb_W) },
    in_W: fmt(out.p_in_W),
    batt: {
      V: fmt(out.batt_V, 3),
      A: fmt(out.batt_A, 3),
      W: out.batt_W >= 0 ? `+${fmt(out.batt_W)}` : fmt(out.batt_W),
    },
    load_W: out.load_W == null ? "—" : fmt(out.load_W),
    soc: out.soc_pct == null ? "—" : `${out.soc_pct}%`,
    status: out.status,
  };

  return out;
}

module.exports = { getPowerInfo };
