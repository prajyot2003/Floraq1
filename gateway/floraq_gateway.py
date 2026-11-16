#!/usr/bin/env python3
"""
FloraQ Intelligent Plant Trainer — Phytopod 360 Raspberry Pi 4 Service

Responsibilities:
1. Reads live JSON telemetry lines sent by the single ESP32 over USB Serial (/dev/ttyUSB0 or /dev/ttyACM0).
2. Sends truthful Raspberry Pi 4 + ESP32 USB serial heartbeats to FloraQ (/api/v1/phytopod/heartbeat).
3. Forwards serial telemetry snapshots to FloraQ history storage (/api/v1/phytopod/serial-telemetry).
4. Works alongside floraq_camera_streamer.py for plant photography & AI disease/stress processing.
"""

import os
import json
import time
import logging
import threading
from datetime import datetime, timezone
import requests

try:
    import serial
except ImportError:
    serial = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (Phytopod RPi4) %(message)s"
)
logger = logging.getLogger("phytopod_rpi4")

CONFIG_PATH = os.environ.get("FLORAQ_CONFIG", "config.json")
if not os.path.exists(CONFIG_PATH):
    CONFIG_PATH = "config.example.json"

with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

CLOUD_BASE_URL = config.get("cloud_base_url", "http://localhost:3000").rstrip("/")
GATEWAY_KEY = config["gateway_api_key"]
SERIAL_PORT = config.get("esp32_serial_port", "/dev/ttyUSB0")
SERIAL_BAUD = int(config.get("esp32_serial_baud", 115200))
HEARTBEAT_INTERVAL = int(config.get("heartbeat_interval_seconds", 20))

state = {
    "esp32_serial_connected": False,
    "watering_enabled": False,
    "ai_pipeline_ready": True,
}


def headers():
    return {
        "Content-Type": "application/json",
        "X-Gateway-Key": GATEWAY_KEY,
    }


def heartbeat_loop():
    """Periodically reports truthful Raspberry Pi 4 & ESP32 USB serial status."""
    url = f"{CLOUD_BASE_URL}/api/v1/phytopod/heartbeat"
    while True:
        try:
            payload = {
                "esp32_serial_connected": state["esp32_serial_connected"],
                "watering_enabled": state["watering_enabled"],
                "ai_pipeline_ready": state["ai_pipeline_ready"],
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            resp = requests.post(url, json=payload, headers=headers(), timeout=10)
            if resp.status_code != 200:
                logger.warning(f"Heartbeat returned HTTP {resp.status_code}: {resp.text}")
        except Exception as exc:
            logger.error(f"Heartbeat request failed: {exc}")
        time.sleep(HEARTBEAT_INTERVAL)


def serial_reader_loop():
    """Reads single-line JSON telemetry packets from ESP32 over USB serial."""
    if serial is None:
        logger.error("pyserial is not installed. Run `pip3 install -r requirements.txt`.")
        return

    telemetry_url = f"{CLOUD_BASE_URL}/api/v1/phytopod/serial-telemetry"

    while True:
        try:
            logger.info(f"Opening ESP32 USB serial port {SERIAL_PORT} @ {SERIAL_BAUD} baud...")
            with serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=5) as ser:
                state["esp32_serial_connected"] = True
                logger.info("Connected to ESP32 USB Serial stream.")
                while True:
                    raw_line = ser.readline().decode("utf-8", errors="ignore").strip()
                    if not raw_line:
                        continue
                    try:
                        packet = json.loads(raw_line)
                    except json.JSONDecodeError:
                        logger.debug(f"Ignoring non-JSON serial output: {raw_line}")
                        continue

                    if "watering_enabled" in packet:
                        state["watering_enabled"] = bool(packet["watering_enabled"])

                    packet.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
                    packet.setdefault("chamber_id", config.get("chamber_id", "chamber-alpha-01"))

                    try:
                        resp = requests.post(
                            telemetry_url,
                            json=packet,
                            headers=headers(),
                            timeout=10,
                        )
                        if resp.status_code == 200:
                            logger.info(
                                f"Forwarded ESP32 serial packet (Temp={packet.get('temperature')}, "
                                f"SoilAvg={packet.get('soil_moisture_average')})"
                            )
                        else:
                            logger.warning(f"Telemetry bridge HTTP {resp.status_code}: {resp.text}")
                    except Exception as post_err:
                        logger.error(f"Failed posting serial telemetry: {post_err}")

        except Exception as err:
            state["esp32_serial_connected"] = False
            logger.warning(f"ESP32 USB serial disconnected ({err}). Retrying in 5s...")
            time.sleep(5)


if __name__ == "__main__":
    logger.info("Starting Phytopod 360 Raspberry Pi 4 USB Serial & Pipeline Service")
    hb_thread = threading.Thread(target=heartbeat_loop, daemon=True)
    hb_thread.start()
    serial_reader_loop()
