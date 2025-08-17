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

This is a forecast for the coming days, updated daily:
<p class="forecast"></p>

This weather forecast is [powered by BrightSky](https://brightsky.dev/).

## Power demand

These are live power statistics of the solar powered server:
<dl id="server">
</dl>

(* load average per 15 minutes)

## Battery meter

The background of the top of every page is a battery meter, designed to display the relationship of the energy powering the website and the visitor traffic consuming it.

The battery meter represents the **State of Charge (SOC) percentage** of our battery, calculated from voltage readings and calibrated to show actual energy storage capacity. This percentage is derived from monitoring data from our AXP20x power management system and INA228 current shunt sensor.

The monitoring system distinguishes between charging and discharging states. When solar charging is active (indicated by a sun icon), the battery meter shows the charging status. When not charging, it displays the current SOC percentage with a battery icon. The background height dynamically adjusts to represent the remaining battery capacity.

Our monitoring system provides real-time data on:

- **Main battery SOC**: Primary energy storage percentage
- **Backup battery SOC**: AXP20x battery capacity as backup
- **Voltage readings**: Both shunt voltage and AXP20x battery voltage
- **Current flow**: Real-time current draw and charging rates
- **Power consumption**: System load power and input power
- **Temperature**: CPU temperature and system load averages

The battery meter serves as a live dashboard of our solar power system's health. During sunny periods, you'll see the charging indicator, while cloudy conditions or nighttime will show the actual storage percentage. The system automatically manages power states and provides comprehensive monitoring data for those interested in solar PV system operation.

Our current setup continues to evolve as we experiment with different battery and solar panel configurations to optimize the balance between uptime and sustainability. The monitoring system captures both the "naked" voltage data and processed SOC calculations, making it informative for both casual visitors and solar power enthusiasts.

{{% figure src="solar_setup.jpg" %}} The accessibility of this website depends on the weather in San Francisco, CA. {{% /figure %}}
