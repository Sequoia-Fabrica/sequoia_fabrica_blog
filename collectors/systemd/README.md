# Systemd Services for Monitoring Collectors

This directory contains systemd service and timer files for the monitoring data collectors.

## Prerequisites

1. **Create monitoring user and group**:
   ```bash
   sudo groupadd monitoring
   sudo useradd -r -g monitoring -s /bin/false monitoring
   ```

2. **Create log directory**:
   ```bash
   sudo mkdir -p /var/log/monitoring
   sudo chown monitoring:monitoring /var/log/monitoring
   sudo chmod 755 /var/log/monitoring
   ```

3. **Set permissions for API directory**:
   ```bash
   sudo usermod -a -G www-data monitoring
   sudo chgrp -R www-data /var/www/html/api/
   sudo chmod -R 775 /var/www/html/api/
   ```

4. **Deploy application code**:
   ```bash
   # Deploy the application to /home/olimex/sequoia_fabrica_blog
   sudo cp -r /path/to/your/repo /home/olimex/sequoia_fabrica_blog
   sudo chown -R monitoring:monitoring /home/olimex/sequoia_fabrica_blog
   ```

## Installation

1. **Copy service files**:
   ```bash
   sudo cp collectors/systemd/*.service /etc/systemd/system/
   sudo cp collectors/systemd/*.timer /etc/systemd/system/
   ```

2. **Reload systemd configuration**:
   ```bash
   sudo systemctl daemon-reload
   ```

3. **Enable and start timers**:
   ```bash
   sudo systemctl enable --now power-collector.timer
   sudo systemctl enable --now weather-collector.timer
   sudo systemctl enable --now calendar-collector.timer
   sudo systemctl enable --now data-orchestrator.timer
   ```

## Monitoring

### Check timer status
```bash
sudo systemctl list-timers --all
```

### Check service logs
```bash
# View live logs
journalctl -u power-collector.service -f
journalctl -u weather-collector.service -f
journalctl -u calendar-collector.service -f
journalctl -u data-orchestrator.service -f

# View recent logs
journalctl -u power-collector.service --since "1 hour ago"
```

### Manual service runs (for testing)
```bash
sudo systemctl start power-collector.service
sudo systemctl start weather-collector.service
sudo systemctl start calendar-collector.service
sudo systemctl start data-orchestrator.service
```

### Check service status
```bash
sudo systemctl status power-collector.timer
sudo systemctl status weather-collector.timer
sudo systemctl status calendar-collector.timer
sudo systemctl status data-orchestrator.timer
```

## Schedule Overview

- **Power Collector**: Every 5 minutes
- **Weather Collector**: Every 15 minutes  
- **Calendar Collector**: Every 30 minutes
- **Data Orchestrator**: Every 2 minutes

All timers include randomized delays to prevent simultaneous execution and reduce system load spikes.

## Log Files

All collectors write to `/var/log/monitoring/`:
- `power_metrics.jsonl`
- `weather_cache.jsonl` 
- `calendar_cache.jsonl`

The data orchestrator reads from these files and generates JSON API files in `/var/www/html/api/`.

## Troubleshooting

### Permission issues
- Ensure the monitoring user can write to `/var/log/monitoring/`
- Check that the application directory is owned by the monitoring user

### Network issues
- Weather and calendar collectors require internet access
- Check firewall and DNS settings

### Missing dependencies
- Ensure Node.js is installed and accessible at `/usr/bin/node`
- Verify all npm dependencies are installed in the application directory