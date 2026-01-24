# Systemd Services for Monitoring Collectors

This directory contains systemd service and timer files for the monitoring data collectors.

## Deployment

**Automated (Recommended)**: Services are deployed automatically via Ansible when changes are pushed to the `ansible/` directory. See `ansible/sol.yml` for the complete configuration.

**Manual**: Follow the instructions below for manual deployment.

## Services Overview

| Service | Type | Schedule | Description |
|---------|------|----------|-------------|
| `esp-logger.service` | Continuous | Always running | Reads battery data from ESP32 via USB serial |
| `power-collector.timer` | Timer | Every 5 min | Processes ESP data and adds system metrics |
| `weather-collector.timer` | Timer | Every 60 min | Fetches weather forecast from BrightSky API |
| `calendar-collector.timer` | Timer | Every 60 min | Fetches events from BookWhen calendar |
| `data-orchestrator.timer` | Timer | Every 2 min | Aggregates data and generates API files |

## Manual Installation

### Prerequisites

1. **Create monitoring user and group**:
   ```bash
   sudo groupadd monitoring
   sudo useradd -r -g monitoring -s /bin/false monitoring
   sudo usermod -a -G dialout monitoring  # For serial port access
   ```

2. **Create log directories**:
   ```bash
   sudo mkdir -p /var/log/esp_logger /var/log/collectors
   sudo chown monitoring:monitoring /var/log/esp_logger /var/log/collectors
   sudo chmod 755 /var/log/esp_logger /var/log/collectors
   ```

3. **Set permissions for API directory**:
   ```bash
   sudo usermod -a -G www-data monitoring
   sudo chgrp -R www-data /var/www/html/api/
   sudo chmod -R 775 /var/www/html/api/
   ```

4. **Deploy application code**:
   ```bash
   # Code is deployed to /opt/sequoia_fabrica_blog by Ansible/rsync
   sudo chown -R monitoring:monitoring /opt/sequoia_fabrica_blog/collectors
   ```

### Installation

1. **Copy service files**:
   ```bash
   sudo cp collectors/systemd/*.service /etc/systemd/system/
   sudo cp collectors/systemd/*.timer /etc/systemd/system/
   ```

2. **Reload systemd configuration**:
   ```bash
   sudo systemctl daemon-reload
   ```

3. **Enable and start services**:
   ```bash
   # Start ESP logger (continuous service)
   sudo systemctl enable --now esp-logger.service

   # Enable and start timers
   sudo systemctl enable --now power-collector.timer
   sudo systemctl enable --now weather-collector.timer
   sudo systemctl enable --now calendar-collector.timer
   sudo systemctl enable --now data-orchestrator.timer
   ```

## Monitoring

### Check all service status
```bash
# ESP logger (should be "active (running)")
sudo systemctl status esp-logger.service

# Timer status
sudo systemctl list-timers --all | grep -E "(power|weather|calendar|data)"
```

### Check service logs
```bash
# View live logs
journalctl -u esp-logger.service -f
journalctl -u power-collector.service -f
journalctl -u data-orchestrator.service -f

# View recent logs
journalctl -u esp-logger.service --since "1 hour ago"
```

### Manual service runs (for testing)
```bash
sudo systemctl start power-collector.service
sudo systemctl start weather-collector.service
sudo systemctl start calendar-collector.service
sudo systemctl start data-orchestrator.service
```

## Schedule Overview

- **ESP Logger**: Continuous (always running)
- **Power Collector**: Every 5 minutes
- **Weather Collector**: Every 60 minutes
- **Calendar Collector**: Every 60 minutes
- **Data Orchestrator**: Every 2 minutes

All timers include randomized delays to prevent simultaneous execution and reduce system load spikes.

## Log Files

| File | Source | Description |
|------|--------|-------------|
| `/var/log/esp_logger/esp_log.jsonl` | esp-logger.service | Raw battery data from ESP32 |
| `/var/log/collectors/power_metrics.jsonl` | power-collector | Processed power metrics |
| `/var/log/collectors/weather.json` | weather-collector | Weather forecast cache |
| `/var/log/collectors/calendar.json` | calendar-collector | Calendar events cache |

The data orchestrator reads from these files and generates JSON API files in `/var/www/html/api/`.

## Troubleshooting

### ESP logger not starting
- Check if ESP32 is connected: `ls -la /dev/ttyUSB*`
- Check serial permissions: user must be in `dialout` group
- View logs: `journalctl -u esp-logger.service -e`

### Permission issues
- Ensure the monitoring user can write to `/var/log/esp_logger/` and `/var/log/collectors/`
- Check that the application directory is readable by the monitoring user

### Network issues
- Weather and calendar collectors require internet access
- Check firewall and DNS settings

### Missing dependencies
- Node.js: Ensure Node.js is installed at `/usr/bin/node`
- Python: Ensure Python 3 and pyserial are installed for esp_logger.py
