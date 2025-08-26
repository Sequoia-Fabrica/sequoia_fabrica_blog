const http = require("http");
const url = require("url");

// Constants for request configuration
const REQUEST_TIMEOUT = 10000; // 10 seconds
const EXPECTED_CONTENT_TYPE = "application/json";

// Retry configuration
const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY: 1000, // Start with 1 second delay
  MAX_DELAY: 10000, // Maximum 10 second delay
  BACKOFF_FACTOR: 2, // Double the delay after each retry
};

/**
 * Implements exponential backoff delay
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
function getBackoffDelay(attempt) {
  const delay =
    RETRY_CONFIG.INITIAL_DELAY * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, attempt);
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes a request with retry logic
 * @param {Function} requestFn - Async function that makes the request
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} - Result from the request
 * @throws {Error} - If all retries fail
 */
async function withRetry(requestFn, operationName) {
  let lastError;

  for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RETRIES; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      if (attempt < RETRY_CONFIG.MAX_RETRIES - 1) {
        const delay = getBackoffDelay(attempt);
        console.warn(
          `Attempt ${attempt + 1}/${
            RETRY_CONFIG.MAX_RETRIES
          } failed for ${operationName}:`,
          error.message,
          `- Retrying in ${delay}ms...`
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `${operationName} failed after ${RETRY_CONFIG.MAX_RETRIES} attempts: ${lastError.message}`
  );
}

/**
 * Make an HTTP GET request with timeout, parse JSON response, and return a promise
 * @param {url.URL} reqUrl - The URL object for the request
 * @param {number} [timeout=REQUEST_TIMEOUT] - Request timeout in milliseconds
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} If request fails, times out, or response is invalid
 */
async function makeRequest(reqUrl, timeout = REQUEST_TIMEOUT) {
  // Validate URL before making request
  if (!reqUrl || !reqUrl.hostname || !reqUrl.pathname) {
    throw new Error(`Invalid URL: ${url.format(reqUrl)}`);
  }

  const fullUrl = url.format(reqUrl);
  console.debug(`Making request to: ${fullUrl}`);

  return new Promise((resolve, reject) => {
    let isRequestClosed = false;

    const handleError = (error, context) => {
      if (isRequestClosed) {
        return;
      }
      isRequestClosed = true;

      const enhancedError = new Error(
        `Request failed for ${fullUrl} - ${context}: ${
          error.message || "Unknown error"
        }`
      );
      enhancedError.originalError = error;
      enhancedError.context = context;
      reject(enhancedError);
    };

    const request = http
      .get(reqUrl, (res) => {
        const { statusCode } = res;
        const contentType = res.headers["content-type"];

        console.debug(
          `Response received - Status: ${statusCode}, Content-Type: ${contentType}`
        );

        // Validate response status and content type
        if (statusCode < 200 || statusCode >= 300) {
          const error = new Error(
            `HTTP ${statusCode} - ${res.statusMessage || "Unknown status"}`
          );
          error.statusCode = statusCode;
          error.headers = res.headers;
          res.resume(); // Consume response data to free up memory
          return handleError(error, "Status code error");
        }

        if (!contentType?.toLowerCase().includes(EXPECTED_CONTENT_TYPE)) {
          const error = new Error(
            `Expected ${EXPECTED_CONTENT_TYPE} but received ${contentType}`
          );
          error.contentType = contentType;
          res.resume(); // Consume response data to free up memory
          return handleError(error, "Content type mismatch");
        }

        // Parse response as JSON if successful
        res.setEncoding("utf8");
        let rawData = "";

        res.on("data", (chunk) => (rawData += chunk));

        res.on("end", () => {
          if (isRequestClosed) {
            return;
          }

          try {
            if (!rawData) {
              return handleError(
                new Error("Empty response received"),
                "Empty response"
              );
            }
            resolve(JSON.parse(rawData));
          } catch (e) {
            handleError(e, "JSON parse error");
          }
        });

        res.on("error", (error) => {
          handleError(error, "Response stream error");
        });
      })
      .on("error", (error) => {
        // Check for common network errors and provide more context
        const errorMessage =
          error.code === "ENOTFOUND"
            ? "DNS lookup failed"
            : error.code === "ECONNREFUSED"
            ? "Connection refused"
            : error.code === "ECONNRESET"
            ? "Connection reset"
            : error.message || "Unknown network error";

        handleError(error, `Network error (${error.code}): ${errorMessage}`);
      });

    // Add timeout handling
    request.setTimeout(timeout, () => {
      handleError(new Error(`Request timed out after ${timeout}ms`), "Timeout");
      request.destroy();
    });
  });
}

// Weather API configuration
const WEATHER_CONFIG = {
  WMO_STATION_ID: 72494, // Station ID for San Francisco
  TIMEZONE: "America/Los_Angeles",
  UNITS: "dwd",
  API_HOST: "api.brightsky.dev",
  API_PATH: "/weather",
  FORECAST_HOUR: 12, // Noon
};

// Solar irradiation configuration for San Francisco
const SOLAR_CONFIG = {
  PEAK_START_HOUR: 9,  // 9 AM - start of useful solar generation
  PEAK_END_HOUR: 16,   // 4 PM - end of peak solar generation
  TIMEZONE: "America/Los_Angeles"
};

/**
 * Creates a formatted date string for the API
 * @param {number} daysFromNow - Number of days from current date
 * @returns {string} Formatted date string (YYYY-MM-DD)
 */
function getFormattedDate(daysFromNow = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split("T")[0]; // Get YYYY-MM-DD format
}

/**
 * Get the next 3 solar peak periods (noon times) starting from today or tomorrow
 * @returns {Array<{date: string, label: string}>} Array of solar peak dates and labels
 */
function getNextSolarPeakPeriods() {
  const now = new Date();
  const sfTime = new Date(now.toLocaleString("en-US", {timeZone: SOLAR_CONFIG.TIMEZONE}));
  const currentHour = sfTime.getHours();
  
  const periods = [];
  let startDay = 0;
  
  // If it's past noon (12 PM), start forecasting from tomorrow
  if (currentHour >= 12) {
    startDay = 1;
  }
  
  for (let i = 0; i < 3; i++) {
    const forecastDate = new Date(sfTime);
    forecastDate.setDate(sfTime.getDate() + startDay + i);
    
    const labels = ['today', 'tomorrow', 'day after tomorrow'];
    let label;
    
    if (startDay === 0) {
      label = labels[i];
    } else {
      // If starting from tomorrow, shift labels
      label = i === 0 ? 'tomorrow' : (i === 1 ? 'day after tomorrow' : 'in 3 days');
    }
    
    periods.push({
      date: forecastDate.toISOString().split('T')[0], // YYYY-MM-DD
      label: label
    });
  }
  
  return periods;
}

/**
 * Queries the BrightSky API for weather data for San Francisco
 * Fetches forecasts for the next 3 solar peak periods (around noon)
 * @returns {Promise<Object>} Object containing weather icons for solar charging periods
 * @property {string} today_icon - Weather icon code for next solar period
 * @property {string} tomorrow_icon - Weather icon code for second solar period  
 * @property {string} day_after_t_icon - Weather icon code for third solar period
 * @throws {Error} If the weather API request fails
 */
async function getWeather() {
  const solarPeriods = getNextSolarPeakPeriods();
  console.log('Fetching weather for solar peak periods:', solarPeriods.map(p => `${p.label}: ${p.date}`).join(', '));
  
  const forecasts = [
    { title: "today", date: solarPeriods[0].date },
    { title: "tomorrow", date: solarPeriods[1].date },
    { title: "day_after_t", date: solarPeriods[2].date },
  ];

  const weather = {};

  for (const forecast of forecasts) {
    const requestUrl = url.parse(
      url.format({
        protocol: "http",
        hostname: WEATHER_CONFIG.API_HOST,
        pathname: WEATHER_CONFIG.API_PATH,
        query: {
          wmo_station_id: WEATHER_CONFIG.WMO_STATION_ID,
          date: forecast.date,
          tz: WEATHER_CONFIG.TIMEZONE,
          units: WEATHER_CONFIG.UNITS,
          // Request specific hour data around solar peak (noon)
          last_date: forecast.date + 'T' + WEATHER_CONFIG.FORECAST_HOUR.toString().padStart(2, '0') + ':00',
        },
      })
    );

    try {
      const response = await withRetry(
        () => makeRequest(requestUrl),
        `weather fetch for ${forecast.title}`
      );
      // Find the weather data closest to our solar peak hour (noon)
      const weatherData = response.weather || [];
      let selectedWeather = weatherData[0]; // Default to first entry
      
      // Look for entry closest to our target hour (noon)
      if (weatherData.length > 1) {
        const targetHour = WEATHER_CONFIG.FORECAST_HOUR;
        selectedWeather = weatherData.reduce((closest, current) => {
          if (!current.timestamp) return closest;
          
          const currentHour = new Date(current.timestamp).getHours();
          const closestHour = new Date(closest.timestamp || current.timestamp).getHours();
          
          return Math.abs(currentHour - targetHour) < Math.abs(closestHour - targetHour) 
            ? current 
            : closest;
        }, weatherData[0]);
      }
      
      weather[forecast.title + "_icon"] = selectedWeather?.icon ?? "";
    } catch (error) {
      console.error(
        `Failed to fetch weather for ${forecast.title} after all retries:`,
        error.message
      );
      weather[forecast.title + "_icon"] = ""; // Set empty icon after all retries fail
    }
  }

  // All forecasts are now solar-relevant since we fetch for solar peak periods
  weather.solar_relevant = true;
  
  return weather;
}

module.exports = getWeather;
