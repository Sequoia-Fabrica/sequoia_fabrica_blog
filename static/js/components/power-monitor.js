// static/js/components/power-monitor.js
// Power monitoring component with detailed metrics and sparklines

class PowerMonitor {
  // Time range configurations matching data-orchestrator.js
  static TIME_RANGES = {
    '8h': { label: '8hr', filename: 'stats-8h.json' },
    '24h': { label: '24hr', filename: 'stats.json' },
    '7d': { label: '7 days', filename: 'stats-7d.json' },
    '30d': { label: '30 days', filename: 'stats-30d.json' }
  };

  constructor() {
    this.currentTimeRange = '24h'; // Default time range
    this.statsUrl = "/api/stats.json";
    this.refreshInterval = null;
    this.refreshRate = 10000; // 10 seconds
  }

  getStatsUrl(timeRange = this.currentTimeRange) {
    const range = PowerMonitor.TIME_RANGES[timeRange];
    return range ? `/api/${range.filename}` : '/api/stats.json';
  }

  setTimeRange(timeRange) {
    if (PowerMonitor.TIME_RANGES[timeRange]) {
      this.currentTimeRange = timeRange;
      this.statsUrl = this.getStatsUrl(timeRange);
      this.updateTimeRangeUI();
      this.refresh();
    }
  }

  updateTimeRangeUI() {
    const selector = document.getElementById('time-range-selector');
    if (!selector) return;

    const links = selector.querySelectorAll('a[data-range]');
    links.forEach(link => {
      const range = link.getAttribute('data-range');
      if (range === this.currentTimeRange) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  renderTimeRangeSelector() {
    const serverElement = document.getElementById('server');
    if (!serverElement) return;

    // Check if selector already exists
    if (document.getElementById('time-range-selector')) return;

    const selector = document.createElement('div');
    selector.id = 'time-range-selector';
    selector.className = 'time-range-selector';

    const links = Object.entries(PowerMonitor.TIME_RANGES).map(([key, config]) => {
      const activeClass = key === this.currentTimeRange ? ' active' : '';
      return `<a href="#" data-range="${key}" class="time-range-link${activeClass}">${config.label}</a>`;
    });

    selector.innerHTML = links.join(' ');

    // Insert before the server stats
    serverElement.parentNode.insertBefore(selector, serverElement);

    // Add click handlers
    selector.querySelectorAll('a[data-range]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const range = link.getAttribute('data-range');
        this.setTimeRange(range);
      });
    });
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

    // Validate that all data points are numeric
    const validatedData = data.filter(d => Number.isFinite(d));
    if (validatedData.length < 2) {
      // Return loading state if data is invalid
      return this.createSparklineSVG([], width, height);
    }

    const min = Math.min(...validatedData);
    const max = Math.max(...validatedData);
    const range = max - min || 1;
    const xStep = width / (validatedData.length - 1);

    // Build path using validated numeric data
    let pathData = `M 0,${height - ((validatedData[0] - min) / range) * height}`;
    for (let i = 1; i < validatedData.length; i++) {
      const x = i * xStep;
      const y = height - ((validatedData[i] - min) / range) * height;
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

    // Build stats with explicit content types for safe rendering
    // { text: string } for API values, { html: string } for trusted internal SVGs
    const stats = [
      ["Local time", { text: data.local_time || "—" }],
      ["Uptime", { text: data.uptime || "—" }],
      [
        "Power usage",
        { text: this.formatUnit(loadW, "W"), svg: this.createSparklineSVG(sparklines.powerUsage) }
      ],
      [
        "Current draw",
        {
          text: Number.isFinite(i_mA) ? this.formatCurrent(i_mA) : "—",
          svg: Number.isFinite(i_mA) ? this.createSparklineSVG(sparklines.currentDraw) : null
        }
      ],
      [
        "Voltage",
        {
          text: this.isPresent(batteryV) ? this.formatUnit(batteryV, "V") : "—",
          svg: this.isPresent(batteryV) ? this.createSparklineSVG(sparklines.voltage) : null
        }
      ],
      [
        "CPU temperature",
        {
          text: this.isPresent(data.fmt?.cpu?.temp) ? String(data.fmt.cpu.temp) : "—",
          svg: this.isPresent(cpuTemp) ? this.createSparklineSVG(sparklines.cpuTemp) : null
        }
      ],
      [
        "CPU load average *",
        {
          text: this.isPresent(data.fmt?.cpu?.load_15min) ? `${data.fmt.cpu.load_15min}%` : "—",
          svg: this.isPresent(cpuLoad) ? this.createSparklineSVG(sparklines.cpuLoad) : null
        }
      ],
      ["Status", this.createStatusElement(data.fmt?.status || "—")],
      [
        "Battery SOC",
        {
          node: this.createPercentageElement(this.isPresent(data.fmt?.soc) ? data.fmt.soc : "—"),
          svg: socPct ? this.createSparklineSVG(sparklines.mainBattery) : null
        }
      ]
    ];

    const serverElement = document.getElementById("server");
    if (serverElement) {
      this.renderDefinitionList(serverElement, stats);
    }
  }

  renderDefinitionList(container, pairs) {
    container.innerHTML = ''; // Clear existing content
    pairs.forEach(([term, content]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      container.appendChild(dt);

      const dd = document.createElement('dd');

      if (content.node) {
        // Pre-built DOM node
        dd.appendChild(content.node);
        if (content.svg) {
          const svgContainer = document.createElement('span');
          svgContainer.innerHTML = content.svg; // Trusted internal SVG
          dd.appendChild(svgContainer);
        }
      } else if (content.text !== undefined) {
        // Text value (escaped via textContent)
        const textSpan = document.createElement('span');
        textSpan.textContent = content.text;
        dd.appendChild(textSpan);
        if (content.svg) {
          const svgContainer = document.createElement('span');
          svgContainer.innerHTML = content.svg; // Trusted internal SVG
          dd.appendChild(svgContainer);
        }
      } else if (content instanceof Node) {
        // Direct DOM node
        dd.appendChild(content);
      } else {
        // Fallback: treat as text
        dd.textContent = String(content);
      }

      container.appendChild(dd);
    });
  }

  createStatusElement(status) {
    const span = document.createElement('span');
    if (status === "Full" || status === "Charging") {
      span.className = 'status-full';
    }
    span.textContent = status;
    return { node: span };
  }

  createPercentageElement(percentage) {
    const span = document.createElement('span');
    span.textContent = percentage;
    if (percentage && String(percentage).includes("%")) {
      const value = parseInt(percentage, 10);
      if (value >= 80) {
        span.className = 'status-good';
      } else if (value >= 50) {
        span.className = 'status-percentage';
      }
    }
    return span;
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
        // Render time range selector on power page
        this.renderTimeRangeSelector();
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
