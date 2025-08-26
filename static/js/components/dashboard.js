// static/js/components/dashboard.js
// Dashboard component for main page battery meter and stats

class Dashboard {
  constructor() {
    this.statsUrl = "/api/stats.json";
    this.weatherUrl = "/api/weather.json";
  }

  async loadData() {
    try {
      // Load stats and weather data in parallel
      const [statsResponse, weatherResponse] = await Promise.all([
        fetch(this.statsUrl, { cache: "no-store" }),
        fetch(this.weatherUrl, { cache: "no-store" })
      ]);
      
      const stats = await statsResponse.json();
      const weather = await weatherResponse.json();
      
      return { stats, weather };
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      return { stats: {}, weather: {} };
    }
  }

  setupBatteryMeter(data) {
    const batteryLevel = this.clamp(this.safeInt(data.soc_pct), 0, 100);
    const levelElement = document.getElementById("battery-level");

    if (levelElement) {
      levelElement.textContent = batteryLevel;
    }
  }

  populateDashboard(stats) {
    const batteryText = stats.fmt?.status || stats.fmt?.soc || "—";

    // Get power usage from available sources, prioritize load_W
    let powerUsed = stats.load_W || stats.p_in_W || stats.W;
    if (powerUsed != null && Number.isFinite(powerUsed)) {
      powerUsed = `${powerUsed.toFixed(2)}W`;
    } else {
      powerUsed = "—";
    }

    // Get uptime if available, otherwise show "—"
    const uptime = stats.uptime || "—";

    const dashboardStats = [
      ["Location", "San Francisco, CA"],
      ["Time", stats.local_time || "—"],
      ["Battery status", batteryText],
      ["Power draw", powerUsed],
      ["Uptime", uptime],
    ];

    const statsElement = document.getElementById("stats");
    if (statsElement) {
      statsElement.innerHTML = this.createDefinitionList(dashboardStats);
    }
  }

  populateForecast(weather) {
    // All forecasts are now solar-relevant since we fetch for solar peak periods
    
    const weatherIgnore = ["snow", "sleet", "wind"]; // because SF is practically tropical
    const weatherIcons = ["today_icon", "tomorrow_icon", "day_after_t_icon"];
    const weatherDays = ["today", "tomorrow", "day after tomorrow"];

    const forecast = weatherIcons
      .filter(
        (icon) =>
          weather[icon] && typeof weather[icon] === "string" && weather[icon].trim() !== ""
      )
      .map((icon, index) => {
        const iconName = weather[icon];

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

  createDefinitionList(pairs) {
    return pairs
      .map(([term, definition]) => `<dt>${term}</dt><dd>${definition}</dd>`)
      .join("");
  }

  // Utility functions
  safeInt(value, defaultValue = 0) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : defaultValue;
  }

  clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Initialize dashboard components
  async init() {
    try {
      const { stats, weather } = await this.loadData();
      
      this.setupBatteryMeter(stats);
      this.populateDashboard(stats, weather);
      this.populateForecast(weather);
      
    } catch (error) {
      console.error("Failed to initialize dashboard:", error);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dashboard;
} else {
  window.Dashboard = Dashboard;
}