---
title: "Power Dashboard"
description: "Live solar power statistics for sequoia.garden"
layout: "power"
slug: "power"
authors: [""]
categories: [""]
tags: []
featured_image: "solar-powered-server-weather-2.png"
---

## How This Site Works

This website runs on a solar-powered server located in San Francisco. The accessibility of this site depends on the weather and our battery's state of charge.

### About Our Solar Setup

Our monitoring system uses an ESP32 microcontroller with an INA228 precision current shunt sensor to track energy flow with high accuracy. The system provides real-time data on:

- **Battery SOC**: Energy storage percentage calculated via coulomb counting
- **Battery voltage**: Real-time voltage measured at the battery terminals
- **Current flow**: Precise current draw and charging rates from shunt measurements
- **Power consumption**: System load power derived from battery current flow
- **Solar input**: Estimated solar panel power based on battery charge rate
- **Temperature**: CPU temperature and system load averages

### Battery Meter Explained

The background of the top of every page is a battery meter, designed to display the relationship of the energy powering the website and the visitor traffic consuming it.

The battery meter represents the **State of Charge (SOC) percentage** of our battery, calculated using coulomb counting and calibrated to show actual energy storage capacity.

During constant voltage (CV) or float charging phases, the battery is considered full. When solar charging is active (indicated by a sun icon), the battery meter shows the charging status. When discharging, it displays the current SOC percentage with a battery icon.

## The Setup

{{% figure src="solar_setup.jpg" %}} The accessibility of this website depends on the weather in San Francisco, CA. {{% /figure %}}

Our current setup continues to evolve as we experiment with different battery and solar panel configurations to optimize the balance between uptime and sustainability.

## Weather Forecast

This is a forecast for the coming days in San Francisco, CA, updated hourly:
<p class="forecast"></p>

Weather data is [powered by BrightSky](https://brightsky.dev/).
