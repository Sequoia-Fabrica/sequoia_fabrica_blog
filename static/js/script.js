// static/js/script.js

// console.log('script loaded');

let url = "/api/stats.json";
let data;
let solar_stats = [];
let battery_stats = [];
let general_stats = [];

loadJSON();

async function loadJSON() {
    try {
        const response = await fetch(url, { cache: "no-store" });
        const data = await response.json();
        setupBatteryMeter(data);
        populateDashboard(data);
        populateForecast(data);

        if (window.location.href.indexOf("/power/") > -1) {
            populateData(data);
        }
    } catch (e) {
        console.error("Failed to load JSON:", e);
    }
}

function setupBatteryMeter(data) {
    const soc_pct = safeInt(data.soc_pct, safeInt(data.charge, 0)); // fallback to legacy 'charge'
    const charging = inferCharging(data);

    const level = clampInt(soc_pct, 0, 100);
    const indicator = document.getElementById("battery_data");

    document.getElementById("battery").style.height = (100 - level) + "%";
    indicator.style.top = (100 - level) + "vh";

    if (!charging) {
        document.getElementById("level").textContent = level;
    } else {
        indicator.setAttribute("data-charging", "yes");
    }
}

function pushData(arr) {
    // returns a list of dt/dd pairs from a two-dimensional array
    let stats = [];
    for (let i = 0; i < arr.length; i++) {
        stats.push("<dt>" + arr[i][0] + "</dt><dd>" + arr[i][1] + "</dd>");
    }
    return stats;
}

function populateData(data) {
    const local_time = data.local_time || "";
    const uptime = data.uptime || "";

    // Prefer true system load; fallback to adapter input; finally old 'W'
    const load_W = num(data.load_W, num(data.p_in_W, num(data.W, 0)));
    const batt_V = num(data.batt_V, num(data.V, 0));
    const load_A = batt_V > 0 ? (load_W / batt_V) : null;

    const cpuTemp = present(data.temperature) ? data.temperature + "°C" : "—";

    // legacy: load_15 scaled into %
    const loadPct = present(data.load_15) ? ((data.load_15 / 2) * 100).toFixed(2) + "%" : "—";

    const charging = inferCharging(data);
    const chargingStr = charging ? "yes" : "no";

    const soc_pct = present(data.soc_pct) ? data.soc_pct : data.charge;
    const socStr = present(soc_pct) ? soc_pct + "%" : "—";

    const general_stats = [
        ["Local time", local_time],
        ["Uptime", uptime],
        ["Power usage", formatW(load_W)],
        ["Current draw (est.)", present(load_A) ? formatA(load_A) : "—"],
        ["Voltage (battery bus)", present(batt_V) ? formatV(batt_V) : "—"],
        ["CPU temperature", cpuTemp],
        ["CPU load average *", loadPct],
        ["Solar panel active", chargingStr],
        ["Battery capacity", socStr],
    ];

    let dl = document.getElementById("server");
    dl.innerHTML = pushData(general_stats).join("");
}

function populateForecast(data) {
    const weather_ignore = ["snow", "sleet", "wind"]; // because SF is practically tropical
    const weather_data = ["today_icon", "tomorrow_icon", "day_after_t_icon"];
    const weather_days = ["today", "tomorrow", "day after tomorrow"];
    let forecast = "";

    for (let i = 0; i < weather_data.length; i++) {
        let icon_name = weather_data[i];
        if (!data[icon_name]) continue;
        let text = data[icon_name].replace(/-/g, " ");
        let weather_icon;
        if (weather_ignore.includes(data[icon_name])) {
            weather_icon = "cloudy";
        } else {
            weather_icon = data[icon_name];
        }
        forecast +=
            '<span class="weather_day" id="' +
            weather_days[i] +
            '" title="' +
            text +
            '">' +
            weather_days[i] +
            '</span><span class="weather_icon ' +
