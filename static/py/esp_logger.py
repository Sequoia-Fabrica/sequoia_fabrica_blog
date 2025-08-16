import serial
import time
import json
import paho.mqtt.client as mqtt
from datetime import datetime

SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 115200
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "seqfab/sensors/sol"
LOG_FILE = "/var/log/esp_logger/esp_log.jsonl"

def send_time_sync(ser):
    now = int(time.time())
    packet = json.dumps({"epoch": now}) + "\n"
    ser.write(packet.encode("utf-8"))
    print(f"[{datetime.utcnow().isoformat()}] Sent time sync: {now}")

def main():
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)  # allow time for serial port to reset the ESP32

    send_time_sync(ser)

    mqtt_client = mqtt.Client()
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    mqtt_client.loop_start()

    with open(LOG_FILE, "a") as log:
        while True:
            try:
                line = ser.readline().decode("utf-8").strip()
                if not line:
                    continue

                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    print(f"[WARN] Bad JSON: {line}")
                    continue

                # Write to local file
                log.write(json.dumps(msg) + "\n")
                log.flush()

                # Publish to MQTT
                mqtt_client.publish(MQTT_TOPIC, json.dumps(msg))

                print(f"[{msg.get('ts', 'unknown')}] -> MQTT + file")
            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"[ERROR] {e}")
                time.sleep(1)

    mqtt_client.loop_stop()
    mqtt_client.disconnect()
    ser.close()

if __name__ == "__main__":
    main()

