// scripts/getStats.js
const fs = require("fs");
const path = require("path");
const getWeather = require("./weather.js");
const { getPowerInfo } = require("./powerinfo.js");

const STATS_FILE = "/var/www/html/api/stats.json";
const LOG = true;

async function writeFileAtomic(destPath, data) {
  const dir = path.dirname(destPath);
  const tmp = path.join(dir, `.stats.${process.pid}.${Date.now()}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, destPath);
}

async function main() {
  try {
    // Fetch in parallel for speed
    const [weatherData, powerData] = await Promise.all([
      getWeather(),
      getPowerInfo(),
    ]);

    const statsObject = {
      ...powerData, // includes p_in_W, load_W, batt_V/A/W, soc_pct, status, etc.
      ...weatherData, // today_icon, tomorrow_icon, temperatures, etc.
    };

    const json = JSON.stringify(statsObject, null, 2);
    await writeFileAtomic(STATS_FILE, json);

    if (LOG) {
      console.log("Stats written to", STATS_FILE);
      console.log(json);
    }
  } catch (err) {
    console.error("getStats failed:", err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

main();
