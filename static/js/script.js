// static/js/script.js

const STATS_URL = "/api/stats.json";
// const STATS_URL = "http://localhost:8000/stats.json";

// No longer need client-side storage - using server-provided sparkline data

// -- Utility functions --
const safeInt = (value, defaultValue = 0) => {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : defaultValue;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const safeNumber = (value, defaultValue = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const isPresent = (value) => value != null && value !== "";

const formatUnit = (value, unit, decimals = 2) => {
  return Number.isFinite(value) ? `${value.toFixed(decimals)}${unit}` : "—";
};

// Sparkline utility functions

function createSparklineSVG(data, width = 100, height = 20) {
  if (!data || data.length < 2) {
    // Show placeholder dots when no data
    return `<svg width="${width}" height="${height}" class="sparkline sparkline-loading" viewBox="0 0 ${width} ${height}">
      <circle cx="20" cy="${height/2}" r="1" fill="currentColor" opacity="0.3"/>
      <circle cx="40" cy="${height/2}" r="1" fill="currentColor" opacity="0.4"/>
      <circle cx="60" cy="${height/2}" r="1" fill="currentColor" opacity="0.5"/>
      <circle cx="80" cy="${height/2}" r="1" fill="currentColor" opacity="0.4"/>
    </svg>`;
  }
  
  if (data.length === 1) {
    // Show single point as a dot
    return `<svg width="${width}" height="${height}" class="sparkline sparkline-single" viewBox="0 0 ${width} ${height}">
      <circle cx="${width/2}" cy="${height/2}" r="2" fill="currentColor" opacity="0.6"/>
    </svg>`;
  }
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // Avoid division by zero
  
  const xStep = width / (data.length - 1);
  
  let pathData = `M 0,${height - ((data[0] - min) / range) * height}`;
  
  for (let i = 1; i < data.length; i++) {
    const x = i * xStep;
    const y = height - ((data[i] - min) / range) * height;
    pathData += ` L ${x},${y}`;
  }
  
  return `<svg width="${width}" height="${height}" class="sparkline" viewBox="0 0 ${width} ${height}">
    <path d="${pathData}" stroke="currentColor" fill="none" stroke-width="1"/>
  </svg>`;
}

// -- Main functions --
async function loadJSON(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    const data = await response.json();
    setupBatteryMeter(data);
    populateDashboard(data);
    populateForecast(data);

    if (window.location.pathname.includes("/power/")) {
      console.log("DATA", data);
      populateData(data);
    }
  } catch (e) {
    console.error("Failed to load JSON:", e);
  }
}

function setupBatteryMeter(data) {
  const batteryLevel = clamp(safeInt(data.soc_pct || data.charge), 0, 100); // fallback to legacy 'charge'

  const batteryElement = document.getElementById("battery");
  const indicatorElement = document.getElementById("battery_data");
  const levelElement = document.getElementById("battery-level");

  // if (batteryElement) {
  //   batteryElement.style.height = 100 - batteryLevel + "%";
  // }

  if (indicatorElement) {
    // indicatorElement.style.top = 100 - batteryLevel + "vh";
    // if (isCharging) {
    //   indicatorElement.setAttribute("data-charging", "yes");
    // }
  }

  if (levelElement) {
    levelElement.textContent = batteryLevel;
  }
}

function populateData(data) {
  const loadW =
    safeNumber(data.load_W) || safeNumber(data.p_in_W) || safeNumber(data.W);
  const battV =
    safeNumber(data.shunt_V) || safeNumber(data.batt_V) || safeNumber(data.V);
  const loadA = battV > 0 ? loadW / battV : null;
  const socPct = safeInt(data.soc_pct) || safeInt(data.charge);
  const cpuTemp = data.cpu_temp_c;
  const cpuLoad = data.cpu_load_15min;
  const backupSoc = safeNumber(data.axp_batt_capacity);

  // Get sparkline data from API response
  const sparklines = data.sparklines || {};

  const stats = [
    ["Local time", data.local_time || "—"],
    ["Uptime", data.uptime || "—"],
    ["Power usage", formatUnit(loadW, "W") + createSparklineSVG(sparklines.powerUsage)],
    ["Current draw (est.)", 
      (isPresent(loadA) ? formatUnit(loadA, "A", 3) : "—") + 
      (isPresent(loadA) ? createSparklineSVG(sparklines.currentDraw) : "")
    ],
    ["Voltage (battery bus)", formatUnit(battV, "V") + createSparklineSVG(sparklines.voltage)],
    [
      "CPU temperature",
      (isPresent(data.fmt.cpu.temp) ? `${data.fmt.cpu.temp}` : "—") + 
      (isPresent(cpuTemp) ? createSparklineSVG(sparklines.cpuTemp) : "")
    ],
    [
      "CPU load average *",
      (isPresent(data.fmt.cpu.load_15min) ? `${data.fmt.cpu.load_15min}%` : "—") +
      (isPresent(cpuLoad) ? createSparklineSVG(sparklines.cpuLoad) : "")
    ],
    ["Status", data.fmt.status],
    ["Main battery SOC", 
      (isPresent(data.fmt.soc) ? `${data.fmt.soc}` : "—") +
      (socPct ? createSparklineSVG(sparklines.mainBattery) : "")
    ],
    [
      "Backup battery SOC",
      (isPresent(data.fmt.axp_batt.capacity) ? `${data.fmt.axp_batt.capacity}` : "—") +
      (backupSoc ? createSparklineSVG(sparklines.backupBattery) : "")
    ],
  ];

  const serverElement = document.getElementById("server");
  if (serverElement) {
    serverElement.innerHTML = createDefinitionList(stats);
  }
}

function populateForecast(data) {
  const weatherIgnore = ["snow", "sleet", "wind"]; // because SF is practically tropical
  const weatherIcons = ["today_icon", "tomorrow_icon", "day_after_t_icon"];
  const weatherDays = ["today", "tomorrow", "day after tomorrow"];

  const forecast = weatherIcons
    .filter(
      (icon) =>
        data[icon] && typeof data[icon] === "string" && data[icon].trim() !== ""
    )
    .map((icon, index) => {
      const iconName = data[icon];

      // Additional safety check - ensure iconName is valid before processing
      if (!iconName || typeof iconName !== "string" || iconName.trim() === "") {
        return "";
      }

      const displayText = iconName.replace(/-/g, " ");
      const weatherIcon = weatherIgnore.includes(iconName)
        ? "cloudy"
        : iconName;
      const day = weatherDays[index];

      return `
                <span class="weather_day" id="${day}" title="${displayText}">${day}</span>
                <span class="weather_icon icon ${weatherIcon}"> </span>
                <span class="weather_text"> ${displayText}</span>
            `;
    })
    .filter((html) => html !== "") // Remove any empty entries
    .join("");

  document.querySelectorAll(".forecast").forEach((element) => {
    element.innerHTML = forecast;
  });
}

function populateDashboard(data) {
  const isCharging = inferCharging(data);
  const batteryText = isCharging ? "charging" : `${data.fmt.soc}, not charging`;

  // Get power usage from available sources, prioritize load_W
  let powerUsed = data.load_W || data.p_in_W || data.W;
  if (powerUsed != null && Number.isFinite(powerUsed)) {
    powerUsed = `${powerUsed.toFixed(2)}W`;
  } else {
    powerUsed = "—";
  }

  // Get uptime if available, otherwise show "—"
  const uptime = data.uptime || "—";

  const stats = [
    ["Location", "San Francisco, CA"],
    ["Time", data.local_time || "—"],
    ["Battery status", batteryText],
    ["Power draw", powerUsed],
    ["Uptime", uptime],
  ];

  const statsElement = document.getElementById("stats");
  if (statsElement) {
    statsElement.innerHTML = createDefinitionList(stats);
  }
}

function createDefinitionList(pairs) {
  return pairs
    .map(([term, definition]) => `<dt>${term}</dt><dd>${definition}</dd>`)
    .join("");
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadJSON(STATS_URL);
  
  // Set up automatic refresh for power page only
  if (window.location.pathname.includes("/power/")) {
    setInterval(() => {
      loadJSON(STATS_URL);
    }, 10000); // Refresh every 10 seconds
  }

  // Mobile menu toggle
  const menuToggle = document.querySelector(".menu-toggle");
  const menuItems = document.getElementById("menu-items");

  if (menuToggle && menuItems) {
    menuToggle.addEventListener("click", () => {
      menuItems.classList.toggle("show");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (event) => {
      const menu = document.querySelector(".mobile-menu");
      if (menu && !menu.contains(event.target)) {
        menuItems.classList.remove("show");
      }
    });
  }

  // Update comment count
  const comments = document.querySelectorAll(".comment");
  const commentCount = document.getElementById("comment-count");
  if (comments.length > 0 && commentCount) {
    commentCount.textContent = comments.length;
  }

  // Dither toggle functionality
  document.querySelectorAll(".dither-toggle").forEach((icon) => {
    icon.addEventListener("click", () => {
      const figure = icon.closest(".figure-controls")?.previousElementSibling;
      const img = figure?.querySelector("img");

      if (!figure || !img) return;

      const isDithered = figure.getAttribute("data-imgstate") === "dither";

      if (isDithered) {
        figure.setAttribute("data-imgstate", "undither");
        img.src = img.getAttribute("data-original") || img.src;
      } else {
        figure.setAttribute("data-imgstate", "dither");
        img.src = img.getAttribute("data-dither") || img.src;
      }
    });
  });
});
