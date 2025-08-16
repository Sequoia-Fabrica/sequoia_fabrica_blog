// scripts/getStats.js
const fs = require("fs");
const path = require("path");
const getWeather = require("./weather.js");
const { getPowerInfo } = require("./powerinfo.js");
const fetchAndParseICS = require('./parse_calendar.js')

const STATS_FILE = process.env.STATS_FILE || "/var/www/html/api/stats.json";
const LOG = process.env.LOG || true;
const ICS_URL = "http://feeds.bookwhen.com/ical/x3ixm04f5wj7/yf23z4/public.ics"; // bookwhen public calendar url
const CALENDAR_FILE = process.env.CALENDAR_FILE || "/var/www/html/api/calendar.json"

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
    const [weatherData, powerData, calendarData] = await Promise.all([
      getWeather(),
      getPowerInfo(),
      fetchAndParseICS(ICS_URL)
    ]);

    const statsObject = {
      ...powerData, // includes p_in_W, load_W, batt_V/A/W, soc_pct, status, etc.
      ...weatherData, // today_icon, tomorrow_icon, temperatures, etc.
    };

    const statsJSON = JSON.stringify(statsObject);
    await writeFileAtomic(STATS_FILE, statsJSON);
    const calJSON = JSON.stringify(calendarData);
    await writeFileAtomic(CALENDAR_FILE, calJSON);

    if (LOG) {
      console.log("Stats written to", STATS_FILE);
      console.log(statsJSON);

      console.log("Calendar written to", CALENDAR_FILE);
      console.log(calJSON);
    }
  } catch (err) {
    console.error("getStats/calendar failed:", err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

main();
