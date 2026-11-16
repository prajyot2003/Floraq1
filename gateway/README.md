# Phytopod 360 — Hardware, Firebase RTDB & Raspberry Pi 4 Guide

## System Architecture

```
[Physical Sensors] ──(GPIO/I2C/ADC)──> [Single ESP32 (esp32-phytopod-01)]
                                          ├── Reads DHT11, BH1750, Soil 1 & Soil 2
                                          ├── Controls 4 Paired Motor+Valve Relay Zones
                                          ├── Syncs /telemetry & /controls <-> [Firebase RTDB]
                                          └── USB Serial JSON (115200 baud)
                                                    │
                                                    ▼
                                          [Raspberry Pi 4 (rpi4-gw-001)]
                                            ├── USB Serial Bridge & Heartbeat (floraq_gateway.py)
                                            ├── Camera Capture & Streaming (floraq_camera_streamer.py)
                                            └── Plant AI Processing Pipeline
                                                    │
                                                    ▼
                                          [FloraQ Web Application]
                                            ├── Reads live /telemetry from Firebase RTDB
                                            ├── Writes /controls/zone1..zone4 commands
                                            └── Displays live camera, AI diagnostics & Care Logs
```

## GPIO Pin Mapping (Single ESP32)

### Sensors
| Sensor | Pin / Bus | Metric |
|---|---|---|
| DHT11 | GPIO 4 | Temperature (°C), Humidity (%) |
| BH1750 | SDA GPIO 21, SCL GPIO 22 | Light Intensity (lux) |
| Soil Moisture Sensor 1 | GPIO 34 (ADC1) | Soil Moisture 1 (%) |
| Soil Moisture Sensor 2 | GPIO 35 (ADC1) | Soil Moisture 2 (%) |

### Four Irrigation Zones (Two 4-Channel Relay Modules)
| Zone | GPIO | Relay Inputs | Controlled Devices |
|---|---|---|---|
| Zone 1 | GPIO 26 | Module 1 IN1 + IN2 | Motor 1 + Solenoid Valve 1 |
| Zone 2 | GPIO 27 | Module 1 IN3 + IN4 | Motor 2 + Solenoid Valve 2 |
| Zone 3 | GPIO 18 | Module 2 IN1 + IN2 | Motor 3 + Solenoid Valve 3 |
| Zone 4 | GPIO 19 | Module 2 IN3 + IN4 | Motor 4 + Solenoid Valve 4 |

> **Safety Default:** `WATERING_ENABLED = false` in `phytopod360_esp32.ino`. Zone start controls remain locked in FloraQ until hardware safety checks are complete and firmware reports `watering_enabled: true`.

## Raspberry Pi 4 Setup

1. Install dependencies:
   ```bash
   sudo apt update
   sudo apt install -y python3-pip python3-picamera2 libcamera-dev python3-opencv
   pip3 install -r requirements.txt
   ```

2. Configure `/gateway/config.json`:
   ```bash
   cp config.example.json config.json
   ```
   `cloud_base_url` defaults to the live app. Use `http://<your-mac-ip>:3000` only when running the server locally (never `localhost` — on the Pi that means the Pi itself).
   Set `gateway_api_key` and `esp32_serial_port` (`/dev/ttyUSB0` or `/dev/ttyACM0`; check with `ls /dev/ttyUSB* /dev/ttyACM*`).

3. Start the RPi 4 USB Serial Bridge & Camera Streamer:
   ```bash
   python3 floraq_gateway.py
   python3 floraq_camera_streamer.py
   ```
