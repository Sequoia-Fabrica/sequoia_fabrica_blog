// static/js/script.js

const STATS_URL = "/api/stats.json";
// const STATS_URL = "http://localhost:8000/stats.json";

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

const inferCharging = (data) => {
    return (
        data.charging === "yes" ||
        data.charging === true ||
        data.status === "charging" ||
        (data.batt_W && data.batt_W > 0) ||
        (data.batt_A && data.batt_A > 0)
    );
};

// -- Main functions --
async function loadJSON(url) {
    try {
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        setupBatteryMeter(data);
        populateDashboard(data);
        populateForecast(data);

        if (window.location.pathname.includes("/power/")) {
            console.log('DATA', data)
            populateData(data);
        }
    } catch (e) {
        console.error("Failed to load JSON:", e);
    }
}

function setupBatteryMeter(data) {
    const batteryLevel = clamp(safeInt(data.soc_pct || data.charge), 0, 100); // fallback to legacy 'charge'

    const isCharging = inferCharging(data);

    const batteryElement = document.getElementById("battery");
    const indicatorElement = document.getElementById("battery_data");
    const levelElement = document.getElementById("battery-level");

    batteryElement.style.height = 100 - batteryLevel + "%";
    indicatorElement.style.top = 100 - batteryLevel + "vh";

    if (isCharging) {
        indicatorElement.setAttribute("data-charging", "yes");
        levelElement.textContent = batteryLevel;
    } else {
        levelElement.textContent = batteryLevel;
    }
}

function populateData(data) {
    const loadW =
        safeNumber(data.load_W) ||
        safeNumber(data.p_in_W) ||
        safeNumber(data.W);
    const battV = safeNumber(data.batt_V) || safeNumber(data.V);
    const loadA = battV > 0 ? loadW / battV : null;
    const socPct = safeInt(data.soc_pct) || safeInt(data.charge);

    const stats = [
        ["Local time", data.local_time || "—"],
        ["Uptime", data.uptime || "—"],
        ["Power usage", formatUnit(loadW, "W")],
        [
            "Current draw (est.)",
            isPresent(loadA) ? formatUnit(loadA, "A", 3) : "—",
        ],
        ["Voltage (battery bus)", formatUnit(battV, "V")],
        [
            "CPU temperature",
            isPresent(data.temperature) ? `${data.temperature}°C` : "—",
        ],
        [
            "CPU load average *",
            isPresent(data.load_15)
                ? `${((data.load_15 / 2) * 100).toFixed(2)}%`
                : "—",
        ],
        ["Solar panel active", inferCharging(data) ? "yes" : "no"],
        ["Battery capacity", isPresent(socPct) ? `${socPct}%` : "—"],
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
        .filter((icon) => data[icon])
        .map((icon, index) => {
            const iconName = data[icon];
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
        .join("");

    document.querySelectorAll(".forecast").forEach((element) => {
        element.innerHTML = forecast;
    });
}

function populateDashboard(data) {
    const isCharging = data.charging !== "no";
    const batteryText = isCharging
        ? "charging"
        : `${data.charge}%, not charging`;

    const stats = [
        ["Location", "San Francisco, CA"],
        ["Time", data.local_time || "—"],
        ["Battery status", batteryText],
        ["Power used", data.W || "—"],
        ["Uptime", data.uptime || "—"],
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

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById("m-btn");
    const menuList = document.getElementById("menu-list");

    if (mobileMenuBtn && menuList) {
        mobileMenuBtn.addEventListener("click", () => {
            menuList.classList.toggle("show");
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
            const figure =
                icon.closest(".figure-controls")?.previousElementSibling;
            const img = figure?.querySelector("img");

            if (!figure || !img) return;

            const isDithered =
                figure.getAttribute("data-imgstate") === "dither";

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
