// static/js/components/power-monitor.js
// Power monitoring component with detailed metrics and sparklines

class PowerMonitor {
  constructor() {
    this.statsUrl = "/api/stats.json";
    this.refreshInterval = null;
    this.refreshRate = 10000; // 10 seconds
  }

  async loadData() {
    try {
      const response = await fetch(this.statsUrl, { cache: "no-store" });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to load power data:", error);
      return {};
    }
  }

  createSparklineSVG(data, width = 120, height = 24) {
    if (!data || data.length < 2) {
      // Show placeholder dots when no data
      return `<svg width="${width}" height="${height}" class="sparkline sparkline-loading" viewBox="0 0 ${width} ${height}">
        <circle cx="20" cy="${height / 2}" r="1" fill="currentColor" opacity="0.3"/>
        <circle cx="40" cy="${height / 2}" r="1" fill="currentColor" opacity="0.4"/>
        <circle cx="60" cy="${height / 2}" r="1" fill="currentColor" opacity="0.5"/>
        <circle cx="80" cy="${height / 2}" r="1" fill="currentColor" opacity="0.4"/>
      </svg>`;
    }

    if (data.length === 1) {
      // Show single point as a dot
      return `<svg width="${width}" height="${height}" class="sparkline sparkline-single" viewBox="0 0 ${width} ${height}">
        <circle cx="${width / 2}" cy="${height / 2}" r="2" fill="currentColor" opacity="0.6"/>
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

  populatePowerData(data) {
    const loadW = this.safeNumber(data.load_W);
    const axpBattV = this.safeNumber(data.axp_batt_v_V);
    const shuntV = this.safeNumber(data.esp32_v_V);
    const loadA = this.safeNumber(data.esp32_i_mA);
    const socPct = this.safeInt(data.soc_pct);
    const cpuTemp = data.cpu_temp_c;
    const cpuLoad = data.cpu_load_15min;
    const backupSoc = this.safeNumber(data.axp_batt_capacity);

    // Get sparkline data from API response
    const sparklines = data.sparklines || {};

    const stats = [
      ["Local time", data.local_time || "—"],
      ["Uptime", data.uptime || "—"],
      [
        "Power usage",
        this.formatUnit(loadW, "W") + this.createSparklineSVG(sparklines.powerUsage),
      ],
      [
        "Current draw",
        (this.isPresent(loadA) ? this.formatUnit(loadA, "mA", 4) : "—") +
          (this.isPresent(loadA) ? this.createSparklineSVG(sparklines.currentDraw) : ""),
      ],
      [
        "Voltage (power supply)",
        (this.isPresent(axpBattV) ? this.formatUnit(axpBattV, "V") : "—") +
          (this.isPresent(axpBattV) ? this.createSparklineSVG(sparklines.voltage) : ""),
      ],
      [
        "Voltage (battery bus)",
        (this.isPresent(shuntV) ? this.formatUnit(shuntV, "V") : "—") +
          (this.isPresent(shuntV) ? this.createSparklineSVG(sparklines.voltage) : ""),
      ],
      [
        "CPU temperature",
        (this.isPresent(data.fmt?.cpu?.temp) ? `${data.fmt.cpu.temp}` : "—") +
          (this.isPresent(cpuTemp) ? this.createSparklineSVG(sparklines.cpuTemp) : ""),
      ],
      [
        "CPU load average *",
        (this.isPresent(data.fmt?.cpu?.load_15min)
          ? `${data.fmt.cpu.load_15min}%`
          : "—") +
          (this.isPresent(cpuLoad) ? this.createSparklineSVG(sparklines.cpuLoad) : ""),
      ],
      ["Status", this.styleStatus(data.fmt?.status || "—")],
      [
        "Main battery SOC",
        (this.isPresent(data.fmt?.soc) ? this.stylePercentage(data.fmt.soc) : "—") +
          (socPct ? this.createSparklineSVG(sparklines.mainBattery) : ""),
      ],
      [
        "Backup battery SOC",
        (this.isPresent(data.fmt?.axp_batt?.capacity)
          ? this.stylePercentage(data.fmt.axp_batt.capacity)
          : "—") +
          (backupSoc ? this.createSparklineSVG(sparklines.backupBattery) : ""),
      ],
    ];

    const serverElement = document.getElementById("server");
    if (serverElement) {
      serverElement.innerHTML = this.createDefinitionList(stats);
    }
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

  safeNumber(value, defaultValue = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }

  isPresent(value) {
    return value != null && value !== "";
  }

  formatUnit(value, unit, decimals = 2) {
    return Number.isFinite(value) ? `${value.toFixed(decimals)}${unit}` : "—";
  }

  styleStatus(status) {
    if (status === "Full" || status === "Charging") {
      return `<span class="status-full">${status}</span>`;
    }
    return status;
  }

  stylePercentage(percentage) {
    if (percentage && percentage.includes("%")) {
      const value = parseInt(percentage, 10);
      if (value >= 80) {
        return `<span class="status-good">${percentage}</span>`;
      } else if (value >= 50) {
        return `<span class="status-percentage">${percentage}</span>`;
      }
    }
    return percentage;
  }

  // Auto-refresh functionality
  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, this.refreshRate);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  async refresh() {
    try {
      const data = await this.loadData();
      this.populatePowerData(data);
    } catch (error) {
      console.error("Failed to refresh power data:", error);
    }
  }

  // Initialize power monitoring
  async init() {
    try {
      // Initial load
      await this.refresh();

      // Set up auto-refresh only on power page
      if (window.location.pathname.includes("/power/")) {
        this.startAutoRefresh();
        
        // Clean up on page unload
        window.addEventListener("beforeunload", () => {
          this.stopAutoRefresh();
        });
      }

    } catch (error) {
      console.error("Failed to initialize power monitor:", error);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PowerMonitor;
} else {
  window.PowerMonitor = PowerMonitor;
}