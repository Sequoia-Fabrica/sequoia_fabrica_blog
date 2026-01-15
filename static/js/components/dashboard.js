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

    // Get power usage from primary source
    let powerUsed = stats.load_W;
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
      this.renderDefinitionList(statsElement, dashboardStats);
    }
  }

  renderDefinitionList(container, pairs) {
    container.innerHTML = ''; // Clear existing content
    pairs.forEach(([term, definition]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      container.appendChild(dt);

      const dd = document.createElement('dd');
      dd.textContent = definition; // Safe: uses textContent, not innerHTML
      container.appendChild(dd);
    });
  }

  populateForecast(weather) {
    // All forecasts are now solar-relevant since we fetch for solar peak periods

    const weatherIgnore = ["snow", "sleet", "wind"]; // because SF is practically tropical
    const weatherIcons = ["today_icon", "tomorrow_icon", "day_after_t_icon"];
    const weatherDays = ["today", "tomorrow", "day after tomorrow"];

    // Whitelist of allowed weather icon class names
    const allowedWeatherClasses = [
      "clear-day", "clear-night", "cloudy", "fog", "partly-cloudy-day",
      "partly-cloudy-night", "rain", "snow", "sleet", "wind"
    ];

    document.querySelectorAll(".forecast").forEach((element) => {
      // Clear existing content
      element.innerHTML = '';

      weatherIcons.forEach((icon, index) => {
        const iconName = weather[icon];

        // Validate iconName is a safe string
        if (!iconName || typeof iconName !== "string" || iconName.trim() === "") {
          return;
        }

        const displayText = iconName.replace(/-/g, " ");

        // Determine weather icon with whitelist validation
        let weatherIcon = weatherIgnore.includes(iconName) ? "cloudy" : iconName;
        if (!allowedWeatherClasses.includes(weatherIcon)) {
          weatherIcon = "cloudy"; // fallback to safe default
        }

        const day = weatherDays[index];

        // Create DOM elements safely
        const daySpan = document.createElement('span');
        daySpan.className = 'weather_day';
        daySpan.id = day;
        daySpan.title = displayText;
        daySpan.textContent = day;

        const iconSpan = document.createElement('span');
        iconSpan.className = `weather_icon icon ${weatherIcon}`;
        iconSpan.textContent = ' ';

        const textSpan = document.createElement('span');
        textSpan.className = 'weather_text';
        textSpan.textContent = ` ${displayText}`;

        element.appendChild(daySpan);
        element.appendChild(iconSpan);
        element.appendChild(textSpan);
      });
    });
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