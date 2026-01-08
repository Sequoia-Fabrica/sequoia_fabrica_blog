#!/usr/bin/env python3
# collectors/esp_logger.py
# Logs ESP32 battery monitor data from serial port to JSONL file

import serial
import time
import json
import sys
import os
from datetime import datetime, timezone

SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 115200
LOG_FILE = "/var/log/esp_logger/esp_log.jsonl"

def send_time_sync(ser):
    """Send current Unix timestamp to ESP32 for time synchronization"""
    now = int(time.time())
    packet = json.dumps({"epoch": now}) + "\n"
    ser.write(packet.encode("utf-8"))
    print(f"[{datetime.utcnow().isoformat()}Z] Sent time sync: {now}", flush=True)

def ensure_log_dir():
    """Ensure log directory exists"""
    log_dir = os.path.dirname(LOG_FILE)
    os.makedirs(log_dir, exist_ok=True)

def main():
    ensure_log_dir()

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    except serial.SerialException as e:
        print(f"[ERROR] Failed to open serial port {SERIAL_PORT}: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

    time.sleep(2)  # Allow time for serial port to reset the ESP32
    send_time_sync(ser)

    print(f"[{datetime.utcnow().isoformat()}Z] ESP logger started, writing to {LOG_FILE}", flush=True)

    with open(LOG_FILE, "a") as log:
        while True:
            try:
                line = ser.readline().decode("utf-8").strip()
                if not line:
                    continue

                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    print(f"[WARN] Bad JSON: {line}", flush=True)
                    continue

                # Add ISO timestamp if not present
                if "ts" not in msg:
                    msg["ts"] = datetime.now(timezone.utc).isoformat()

                # Write to local file
                log.write(json.dumps(msg) + "\n")
                log.flush()

                # Minimal console output (timestamp every 60 seconds)
                if int(time.time()) % 60 == 0:
                    soc = msg.get("soc", 0) * 100
                    v = msg.get("v", 0)
                    i = msg.get("i", 0)
                    print(f"[{msg.get('ts', 'unknown')}] SOC: {soc:.1f}%, V: {v:.2f}V, I: {i:.0f}mA", flush=True)

            except KeyboardInterrupt:
                print("\n[INFO] Shutting down...", flush=True)
                break
            except Exception as e:
                print(f"[ERROR] {e}", file=sys.stderr, flush=True)
                time.sleep(1)

    ser.close()

if __name__ == "__main__":
    main()
