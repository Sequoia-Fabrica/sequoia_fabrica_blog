---
title: "Power"
date: ""
summary: "This website runs on a [solar powered server](/about/the-solar-website) located in San Francisco, and will go off-line during longer periods of bad weather. This page shows live data relating to power supply, power demand, and energy storage."
slug: "power"
authors: [""]
categories: [""]
tags: []
featured_image: "solar-powered-server-weather-2.png"
---

## Power supply

This is a forecast for the coming days in San Francisco, CA, updated hourly:
<p class="forecast"></p>

This weather forecast is [powered by BrightSky](https://brightsky.dev/).

## Power demand

These are live power statistics of the solar powered server:
<dl id="server">
</dl>

(* load average per 15 minutes)

## Battery meter

The background of the top of every page is a battery meter, designed to display the relationship of the energy powering the website and the visitor traffic consuming it.

The battery meter represents the **State of Charge (SOC) percentage** of our battery, calculated using coulomb counting and calibrated to show actual energy storage capacity. This percentage is derived from our ESP32-based battery monitor with an INA228 precision current shunt sensor, which tracks energy flow in and out of the battery with high accuracy.

The monitoring system uses advanced charge phase detection to distinguish between charging, discharging, and full states. During constant voltage (CV) or float charging phases, the battery is considered full. When solar charging is active (indicated by a sun icon), the battery meter shows the charging status. When discharging, it displays the current SOC percentage with a battery icon. The background height dynamically adjusts to represent the remaining battery capacity.

Our monitoring system provides real-time data on:

- **Battery SOC**: Energy storage percentage calculated via coulomb counting
- **Battery voltage**: Real-time voltage measured at the battery terminals
- **Current flow**: Precise current draw and charging rates from shunt measurements
- **Power consumption**: System load power derived from battery current flow
- **Solar input**: Estimated solar panel power based on battery charge rate
- **Temperature**: CPU temperature and system load averages

The battery meter serves as a live dashboard of our solar power system's health. During sunny periods, you'll see the charging indicator, while cloudy conditions or nighttime will show the actual storage percentage. The ESP32 monitor continuously learns and corrects for current sensor bias, improving accuracy over time.

Our current setup continues to evolve as we experiment with different battery and solar panel configurations to optimize the balance between uptime and sustainability. The shunt-based monitoring provides precise power flow data, making it informative for both casual visitors and solar power enthusiasts.

{{% figure src="solar_setup.jpg" %}} The accessibility of this website depends on the weather in San Francisco, CA. {{% /figure %}}
