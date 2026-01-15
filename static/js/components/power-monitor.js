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
      if (!response.ok) {
        throw new Error(`Stats API request failed with HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to load power data:", error);
      return {};
    }
  }

  createSparklineSVG(data, width = 120, height = 24) {
    if (!data || data.length < 2) {
      return `<svg width="${width}" height="${height}" class="sparkline sparkline-loading" viewBox="0 0 ${width} ${height}">
        <circle cx="20" cy="${
          height / 2
        }" r="1" fill="currentColor" opacity="0.3"/>
        <circle cx="40" cy="${
          height / 2
        }" r="1" fill="currentColor" opacity="0.4"/>
        <circle cx="60" cy="${
          height / 2
        }" r="1" fill="currentColor" opacity="0.5"/>
        <circle cx="80" cy="${
          height / 2
        }" r="1" fill="currentColor" opacity="0.4"/>
      </svg>`;
    }
    if (data.length === 1) {
      return `<svg width="${width}" height="${height}" class="sparkline sparkline-single" viewBox="0 0 ${width} ${height}">
        <circle cx="${width / 2}" cy="${
          height / 2
        }" r="2" fill="currentColor" opacity="0.6"/>
      </svg>`;
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
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

  // ----- Current normalization from ESP32 shunt monitor -----
  normalizeCurrent(data) {
    const n = (x) => (Number.isFinite(+x) ? +x : NaN);

    let i_mA = n(data.esp32_i_mA);
    const p_mW = n(data.esp32_p_mW);
    const v_V = n(data.esp32_v_V);
    const load_W = n(data.load_W);

    // Fallback A: derive from ESP power/voltage (p[mW]/v[V] -> mA)
    if (
      !Number.isFinite(i_mA) &&
      Number.isFinite(p_mW) &&
      Number.isFinite(v_V) &&
      v_V > 0
    ) {
      i_mA = p_mW / v_V; // signed mA
    }

    // Fallback B: derive from total load_W and bus voltage (assume discharge negative)
    if (
      !Number.isFinite(i_mA) &&
      Number.isFinite(load_W) &&
      Number.isFinite(v_V) &&
      v_V > 0
    ) {
      i_mA = -(load_W / v_V) * 1000.0;
    }

    // Guard 1: if |i| is absurd (>10 A) and p/v are sane, recompute from p/v
    if (
      Number.isFinite(i_mA) &&
      Math.abs(i_mA) > 10000 &&
      Number.isFinite(p_mW) &&
      Number.isFinite(v_V) &&
      v_V > 0
    ) {
      i_mA = p_mW / v_V;
    }

    // Guard 2: cross-check shunt power vs load; if >4× apart, trust load_W and derive
    if (
      Number.isFinite(i_mA) &&
      Number.isFinite(p_mW) &&
      Number.isFinite(v_V) &&
      Number.isFinite(load_W) &&
      v_V > 0
    ) {
      const shunt_W = Math.abs(p_mW) / 1000.0;
      const floorW = Math.max(load_W, 0.5); // avoid tiny denominators
      if (shunt_W > 4 * floorW) {
        const alt_mA = -(load_W / v_V) * 1000.0; // discharge negative
        if (Number.isFinite(alt_mA)) i_mA = alt_mA;
      }
    }

    // Guard 3: even if p_mW is missing, if |i| is absurd and we have load_W & V, override from load/V
    if (
      Number.isFinite(i_mA) &&
      Math.abs(i_mA) > 10000 &&
      Number.isFinite(load_W) &&
      Number.isFinite(v_V) &&
      v_V > 0
    ) {
      i_mA = -(load_W / v_V) * 1000.0;
    }

    return Number.isFinite(i_mA) ? i_mA : NaN;
  }

  // ----- Nicer current formatting -----
  formatCurrent(mA, decimalsA = 2) {
    if (!Number.isFinite(mA)) return "—";
    const sign = mA < 0 ? "-" : "";
    const abs = Math.abs(mA);
    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(decimalsA)}A`;
    return `${sign}${abs.toFixed(0)}mA`;
  }

  populatePowerData(data) {
    const loadW = this.safeNumber(data.load_W);
    const batteryV = this.safeNumber(data.esp32_v_V);
    const i_mA = this.normalizeCurrent(data); // use normalized current
    const socPct = this.safeInt(data.soc_pct);
    const cpuTemp = data.cpu_temp_c;
    const cpuLoad = data.cpu_load_15min;

    const sparklines = data.sparklines || {};

    const stats = [
      ["Local time", data.local_time || "—"],
      ["Uptime", data.uptime || "—"],
      [
        "Power usage",
        this.formatUnit(loadW, "W") +
          this.createSparklineSVG(sparklines.powerUsage),
      ],
      [
        "Current draw",
        (Number.isFinite(i_mA) ? this.formatCurrent(i_mA) : "—") +
          (Number.isFinite(i_mA)
            ? this.createSparklineSVG(sparklines.currentDraw)
            : ""),
      ],
      [
        "Voltage",
        (this.isPresent(batteryV) ? this.formatUnit(batteryV, "V") : "—") +
          (this.isPresent(batteryV)
            ? this.createSparklineSVG(sparklines.voltage)
            : ""),
      ],
      [
        "CPU temperature",
        (this.isPresent(data.fmt?.cpu?.temp) ? `${data.fmt.cpu.temp}` : "—") +
          (this.isPresent(cpuTemp)
            ? this.createSparklineSVG(sparklines.cpuTemp)
            : ""),
      ],
      [
        "CPU load average *",
        (this.isPresent(data.fmt?.cpu?.load_15min)
          ? `${data.fmt.cpu.load_15min}%`
          : "—") +
          (this.isPresent(cpuLoad)
            ? this.createSparklineSVG(sparklines.cpuLoad)
            : ""),
      ],
      ["Status", this.styleStatus(data.fmt?.status || "—")],
      [
        "Battery SOC",
        (this.isPresent(data.fmt?.soc)
          ? this.stylePercentage(data.fmt.soc)
          : "—") +
          (socPct ? this.createSparklineSVG(sparklines.mainBattery) : ""),
      ]
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
      await this.refresh();
      if (window.location.pathname.includes("/power/")) {
        this.startAutoRefresh();
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
if (typeof module !== "undefined" && module.exports) {
  module.exports = PowerMonitor;
} else {
  window.PowerMonitor = PowerMonitor;
}
