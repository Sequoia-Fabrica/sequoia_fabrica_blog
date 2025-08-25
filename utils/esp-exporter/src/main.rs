use anyhow::Result;
use clap::Parser;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server};
use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use prometheus::{Encoder, Gauge, IntCounter, Registry, TextEncoder};
use serde::Deserialize;
use std::convert::Infallible;
use std::fs::File;
use std::io::{BufRead, BufReader, Seek, SeekFrom};
use std::path::Path;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{error, info, warn};

#[derive(Parser)]
#[command(name = "esp-exporter")]
#[command(about = "High-performance Prometheus exporter for ESP logger data")]
struct Args {
    #[arg(short, long, default_value = "/var/log/esp_logger/esp_log.jsonl")]
    log_file: String,
    
    #[arg(short, long, default_value = "9112")]
    port: u16,
    
    #[arg(short, long, default_value = "0.0.0.0")]
    bind: String,
}

#[derive(Deserialize, Debug)]
struct EspLogEntry {
    #[serde(rename = "v")]
    voltage: Option<f64>,
    #[serde(rename = "i")]
    current: Option<f64>,
    #[serde(rename = "p")]
    power: Option<f64>,
    #[serde(rename = "soc")]
    state_of_charge: Option<f64>,
    #[serde(rename = "q_C")]
    charge_coulombs: Option<f64>,
    #[serde(rename = "e_J")]
    energy_joules: Option<f64>,
    #[serde(rename = "sh_mV")]
    shunt_voltage_mv: Option<f64>,
    #[serde(rename = "ts")]
    timestamp: Option<String>,
    #[serde(rename = "status")]
    status: Option<String>,
}

struct Metrics {
    registry: Registry,
    voltage: Gauge,
    current: Gauge,
    power: Gauge,
    soc_percent: Gauge,
    charge_coulombs: Gauge,
    energy_joules: Gauge,
    shunt_voltage_mv: Gauge,
    last_update: Gauge,
    lines_processed: IntCounter,
    parse_errors: IntCounter,
}

impl Metrics {
    fn new() -> Result<Self> {
        let registry = Registry::new();
        
        let voltage = Gauge::new("esp_battery_voltage_volts", "Battery voltage in volts")?;
        let current = Gauge::new("esp_battery_current_amps", "Battery current in amps")?;
        let power = Gauge::new("esp_battery_power_watts", "Battery power in watts")?;
        let soc_percent = Gauge::new("esp_battery_soc_percent", "Battery state of charge percentage")?;
        let charge_coulombs = Gauge::new("esp_battery_charge_coulombs", "Battery charge in coulombs")?;
        let energy_joules = Gauge::new("esp_battery_energy_joules", "Battery energy in joules")?;
        let shunt_voltage_mv = Gauge::new("esp_battery_shunt_voltage_millivolts", "Shunt voltage in millivolts")?;
        let last_update = Gauge::new("esp_last_update_timestamp_seconds", "Unix timestamp of last update")?;
        let lines_processed = IntCounter::new("esp_log_lines_processed_total", "Total log lines processed")?;
        let parse_errors = IntCounter::new("esp_log_parse_errors_total", "Total JSON parse errors")?;
        
        registry.register(Box::new(voltage.clone()))?;
        registry.register(Box::new(current.clone()))?;
        registry.register(Box::new(power.clone()))?;
        registry.register(Box::new(soc_percent.clone()))?;
        registry.register(Box::new(charge_coulombs.clone()))?;
        registry.register(Box::new(energy_joules.clone()))?;
        registry.register(Box::new(shunt_voltage_mv.clone()))?;
        registry.register(Box::new(last_update.clone()))?;
        registry.register(Box::new(lines_processed.clone()))?;
        registry.register(Box::new(parse_errors.clone()))?;
        
        Ok(Metrics {
            registry,
            voltage,
            current,
            power,
            soc_percent,
            charge_coulombs,
            energy_joules,
            shunt_voltage_mv,
            last_update,
            lines_processed,
            parse_errors,
        })
    }
    
    fn update(&self, entry: &EspLogEntry) {
        if let Some(v) = entry.voltage {
            self.voltage.set(v);
        }
        if let Some(i) = entry.current {
            self.current.set(i);
        }
        if let Some(p) = entry.power {
            self.power.set(p);
        }
        if let Some(soc) = entry.state_of_charge {
            self.soc_percent.set(soc * 100.0); // Convert to percentage
        }
        if let Some(q) = entry.charge_coulombs {
            self.charge_coulombs.set(q);
        }
        if let Some(e) = entry.energy_joules {
            self.energy_joules.set(e);
        }
        if let Some(sh) = entry.shunt_voltage_mv {
            self.shunt_voltage_mv.set(sh * 1000.0); // Convert to millivolts
        }
        
        // Update timestamp
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as f64;
        self.last_update.set(now);
        
        self.lines_processed.inc();
    }
}

struct LogTailer {
    file_path: String,
    position: u64,
    metrics: Arc<Metrics>,
}

impl LogTailer {
    fn new(file_path: String, metrics: Arc<Metrics>) -> Self {
        // Start from end of file to avoid processing existing entries
        let position = if let Ok(metadata) = std::fs::metadata(&file_path) {
            metadata.len()
        } else {
            0
        };
        
        Self {
            file_path,
            position,
            metrics,
        }
    }
    
    fn read_new_lines(&mut self) -> Result<()> {
        let path = Path::new(&self.file_path);
        if !path.exists() {
            return Ok(());
        }
        
        let mut file = File::open(path)?;
        file.seek(SeekFrom::Start(self.position))?;
        
        let reader = BufReader::new(file);
        let mut new_position = self.position;
        
        for line in reader.lines() {
            let line = line?;
            new_position += line.len() as u64 + 1; // +1 for newline
            
            if line.trim().is_empty() {
                continue;
            }
            
            match serde_json::from_str::<EspLogEntry>(&line) {
                Ok(entry) => {
                    self.metrics.update(&entry);
                    // Only log every 10th update to reduce spam
                    if self.metrics.lines_processed.get() % 10 == 0 {
                        info!("Updated metrics (processed {} entries)", self.metrics.lines_processed.get());
                    }
                }
                Err(e) => {
                    warn!("Failed to parse JSON: {} - Line: {}", e, line);
                    self.metrics.parse_errors.inc();
                }
            }
        }
        
        self.position = new_position;
        Ok(())
    }
    
    async fn start_watching(&mut self) -> Result<()> {
        // Skip reading existing content on startup - we start from end of file
        info!("Starting to watch log file from current position: {}", self.position);
        
        let (tx, mut rx) = tokio::sync::mpsc::channel(100);
        let file_path = self.file_path.clone();
        
        // Set up file watcher
        tokio::task::spawn_blocking(move || {
            let mut watcher = RecommendedWatcher::new(
                move |res: Result<Event, notify::Error>| {
                    if let Ok(_event) = res {
                        let _ = tx.blocking_send(());
                    }
                },
                Config::default(),
            ).unwrap();
            
            let path = Path::new(&file_path);
            if let Some(parent) = path.parent() {
                let _ = watcher.watch(parent, RecursiveMode::NonRecursive);
            }
            
            // Keep the watcher alive
            loop {
                std::thread::sleep(std::time::Duration::from_secs(1));
            }
        });
        
        // Process file changes
        while rx.recv().await.is_some() {
            if let Err(e) = self.read_new_lines() {
                error!("Error reading log file: {}", e);
            }
        }
        
        Ok(())
    }
}

async fn metrics_handler(
    _req: Request<Body>,
    metrics: Arc<Metrics>,
) -> Result<Response<Body>, Infallible> {
    let encoder = TextEncoder::new();
    let metric_families = metrics.registry.gather();
    let mut buffer = Vec::new();
    
    if let Err(e) = encoder.encode(&metric_families, &mut buffer) {
        error!("Failed to encode metrics: {}", e);
        return Ok(Response::builder()
            .status(500)
            .body(Body::from("Internal Server Error"))
            .unwrap());
    }
    
    Ok(Response::builder()
        .header("Content-Type", "text/plain; version=0.0.4")
        .body(Body::from(buffer))
        .unwrap())
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    
    let args = Args::parse();
    
    info!("Starting ESP Prometheus Exporter");
    info!("Log file: {}", args.log_file);
    info!("Bind address: {}:{}", args.bind, args.port);
    
    let metrics = Arc::new(Metrics::new()?);
    let metrics_clone = metrics.clone();
    
    // Start log tailer
    let mut tailer = LogTailer::new(args.log_file, metrics.clone());
    tokio::spawn(async move {
        if let Err(e) = tailer.start_watching().await {
            error!("Log tailer error: {}", e);
        }
    });
    
    // Start HTTP server
    let make_svc = make_service_fn(move |_conn| {
        let metrics = metrics_clone.clone();
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                metrics_handler(req, metrics.clone())
            }))
        }
    });
    
    let addr = format!("{}:{}", args.bind, args.port).parse()?;
    let server = Server::bind(&addr).serve(make_svc);
    
    info!("Metrics server running on http://{}/metrics", addr);
    
    if let Err(e) = server.await {
        error!("Server error: {}", e);
    }
    
    Ok(())
}
