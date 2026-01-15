#!/usr/bin/env node
// collectors/weather-collector.js
// Fetches weather data and caches to JSONL format

const path = require("path");
const fsp = require("fs/promises");

// Import weather module from existing codebase
const getWeather = require("../static/js/weather.js");
const { appendToJsonlSafe } = require("./jsonl-utils.js");

// ---------- CONFIG ----------
const LOGS_DIR = "/var/log/monitoring";
const WEATHER_LOG_PATH = path.join(LOGS_DIR, "weather_cache.jsonl");

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
  try {
    await appendToJsonlSafe(filePath, data);
  } catch (error) {
    console.error("Failed to append to weather JSONL:", error.message);
    throw error;
  }
}


// ---------- MAIN COLLECTION LOGIC ----------
async function collectWeatherData() {
  try {
    const timestamp = new Date().toISOString();
    console.log(`Fetching weather data at ${timestamp}`);

    // Attempt to fetch fresh weather data
    const weatherData = await getWeather();

    // All weather fetches are now solar-relevant since we fetch for solar peak periods

    // Create cache entry for successful fetch
    const cacheEntry = {
      ts: timestamp,
      ms: Date.now(),
      success: true,
      data: weatherData,
      source: "api"
    };

    return cacheEntry;

  } catch (error) {
    console.error("Failed to fetch weather data:", error.message);

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


    // Collect weather data
    const weatherEntry = await collectWeatherData();
    if (weatherEntry) {
      await appendToJsonl(WEATHER_LOG_PATH, weatherEntry);

      if (weatherEntry.success) {
        console.log(`Weather data cached: ${weatherEntry.ts}`);
      } else {
        console.error("Weather fetch failed, error logged");
        process.exitCode = 1;
      }
    } else {
      console.error("Failed to create weather entry");
      process.exitCode = 1;
    }

  } catch (error) {
    console.error("Weather collector failed:", error.message);
    process.exitCode = 1;
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  collectWeatherData,
  WEATHER_LOG_PATH
};