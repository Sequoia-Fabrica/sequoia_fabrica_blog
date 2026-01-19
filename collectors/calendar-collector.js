#!/usr/bin/env node
// collectors/calendar-collector.js
// Fetches calendar data and caches to JSONL format

const path = require("path");
const fsp = require("fs/promises");

// Import calendar module
const fetchAndParseICS = require("../static/js/parse_calendar.js");

// ---------- CONFIG ----------
const LOGS_DIR = "/var/lib/monitoring";
const CALENDAR_LOG_PATH = path.join(LOGS_DIR, "calendar_cache.jsonl");
const ICS_URL = "http://feeds.bookwhen.com/ical/x3ixm04f5wj7/yf23z4/public.ics";

// ---------- HELPERS ----------

async function ensureDirectoryExists(dirPath) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}


async function appendToJsonl(filePath, data) {
  const jsonLine = JSON.stringify(data) + '\n';
  try {
    await fsp.appendFile(filePath, jsonLine);
  } catch (error) {
    console.error("Failed to append to calendar JSONL:", error.message);
    throw error;
  }
}


// Filter events to show only upcoming ones
function filterUpcomingEvents(events) {
  if (!Array.isArray(events)) return [];

  const now = new Date();
  const threeMonthsFromNow = new Date();
  threeMonthsFromNow.setMonth(now.getMonth() + 3);

  return events.filter(event => {
    if (!event.start) return false;

    const eventDate = new Date(event.start);

    // Show events from today onwards, up to 3 months in the future
    return eventDate >= now && eventDate <= threeMonthsFromNow;
  }).sort((a, b) => new Date(a.start) - new Date(b.start)); // Sort by date
}

// ---------- MAIN COLLECTION LOGIC ----------
async function collectCalendarData() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`Fetching calendar data at ${timestamp}`);

    // Attempt to fetch fresh calendar data
    const rawEvents = await fetchAndParseICS(ICS_URL);
    const events = filterUpcomingEvents(rawEvents);

    // Create cache entry
    const cacheEntry = {
      ts: timestamp,
      ms: Date.now(),
      success: true,
      data: events,
      raw_count: Array.isArray(rawEvents) ? rawEvents.length : 0,
      filtered_count: events.length,
      source: "api"
    };

    return cacheEntry;

  } catch (error) {
    console.error("Failed to fetch calendar data:", error.message);

    // Return error entry
    const errorEntry = {
      ts: new Date().toISOString(),
      ms: Date.now(),
      success: false,
      error: error.message,
      source: "error"
    };

    return errorEntry;
  }
}


// ---------- MAIN ----------
async function main() {
  try {
    // Ensure monitoring directories exist
    await ensureDirectoryExists(LOGS_DIR);


    // Collect calendar data
    const calendarEntry = await collectCalendarData();
    if (calendarEntry) {
      await appendToJsonl(CALENDAR_LOG_PATH, calendarEntry);

      if (calendarEntry.success) {
        console.log(`Calendar data cached: ${calendarEntry.ts} (${calendarEntry.filtered_count} events)`);
      } else {
        console.error("Calendar fetch failed, error logged");
        process.exitCode = 1;
      }
    } else {
      console.error("Failed to create calendar entry");
      process.exitCode = 1;
    }

  } catch (error) {
    console.error("Calendar collector failed:", error.message);
    process.exitCode = 1;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  collectCalendarData,
  CALENDAR_LOG_PATH
};