# ESP Logger Prometheus Exporter

High-performance Rust-based Prometheus exporter for ESP logger battery monitoring data.

This is an optional component that exposes battery metrics to Prometheus. It reads from the same `esp_log.jsonl` file that the main collectors use, providing an alternative monitoring path for Prometheus/Grafana setups.

## Features

- **Zero-copy JSON parsing** with serde
- **Real-time file watching** with inotify
- **Efficient log tailing** - only reads new data
- **Comprehensive metrics** - all battery parameters
- **Production-ready** - systemd service included
- **Minimal resource usage** - ~1MB RAM, <1% CPU

## Metrics Exported

| Metric | Description | Unit |
|--------|-------------|------|
| `esp_battery_voltage_volts` | Battery voltage | Volts |
| `esp_battery_current_amps` | Battery current | Amps |
| `esp_battery_power_watts` | Battery power | Watts |
| `esp_battery_soc_percent` | State of charge | Percentage |
| `esp_battery_charge_coulombs` | Charge | Coulombs |
| `esp_battery_energy_joules` | Energy | Joules |
| `esp_battery_shunt_voltage_millivolts` | Shunt voltage | Millivolts |
| `esp_last_update_timestamp_seconds` | Last update time | Unix timestamp |
| `esp_log_lines_processed_total` | Lines processed | Counter |
| `esp_log_parse_errors_total` | Parse errors | Counter |

## Build & Install

```bash
# Build optimized release
cargo build --release

# Install binary
sudo cp target/release/esp-exporter /usr/local/bin/

# Install systemd service
sudo cp esp-exporter.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable esp-exporter
sudo systemctl start esp-exporter
```

## Usage

```bash
# Run directly
./esp-exporter --log-file /var/log/esp_logger/esp_log.jsonl --port 9112

# Check status
sudo systemctl status esp-exporter

# View logs
sudo journalctl -u esp-exporter -f
```

## Prometheus Configuration

Add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'esp-logger'
    static_configs:
      - targets: ['localhost:9112']
    scrape_interval: 15s
```

## Performance

- **Memory**: ~1MB RSS
- **CPU**: <1% on log updates
- **Latency**: <1ms metric updates
- **Throughput**: >10k lines/sec
