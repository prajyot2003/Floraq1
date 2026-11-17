#!/usr/bin/env python3
"""
FloraQ Intelligent Plant Trainer — Raspberry Pi 4 Camera Service
Captures photos and low-latency video frames from RPi Camera (Picamera2 / IMX477 / IMX219 / USB).
Handles:
1. Live snapshot push to FloraQ Cloud for real-time monitoring.
2. Scheduled high-resolution plant photography with sensor snapshot attachment.
3. On-demand authenticated capture commands.
"""

import os
import sys
import time
import json
import base64
import logging
from io import BytesIO
from datetime import datetime, timezone
import requests
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] (FloraQ Cam) %(message)s")
logger = logging.getLogger("floraq_cam")

CONFIG_PATH = os.environ.get("FLORAQ_CONFIG", "config.json")
if not os.path.exists(CONFIG_PATH):
    CONFIG_PATH = "config.example.json"

with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

CAMERA_ID = config.get("camera", {}).get("camera_id", "cam-csi-01")
SNAPSHOT_URL = f"{config['cloud_camera_url']}/snapshot-frame"
IMAGES_URL = f"{config['cloud_camera_url']}/images"
GATEWAY_KEY = config["gateway_api_key"]
CHAMBER_ID = config["chamber_id"]

_picam2 = None


def capture_hardware_frame():
    """
    Captures one JPEG frame from the RPi camera (Picamera2).
    The camera is opened once and reused: opening a new Picamera2() per frame
    without closing it leaves libcamera in 'Configured' state and every later
    frame fails ("Camera __init__ sequence did not complete").
    Returns None if the camera is unavailable, so no fake frame is uploaded.
    """
    global _picam2
    try:
        if _picam2 is None:
            from picamera2 import Picamera2
            _picam2 = Picamera2()
            _picam2.configure(_picam2.create_preview_configuration(main={"size": (1920, 1080), "format": "RGB888"}))
            _picam2.start()
            time.sleep(1)  # let auto-exposure settle
        frame = _picam2.capture_array()
        img = Image.fromarray(frame[:, :, ::-1])  # RGB888 buffer is BGR order
        buffer = BytesIO()
        img.save(buffer, format="JPEG", quality=85)
        return buffer.getvalue()
    except Exception as e:
        logger.warning(f"Camera capture failed ({e}); will reopen on next attempt.")
        if _picam2 is not None:
            try:
                _picam2.close()
            except Exception:
                pass
            _picam2 = None
        return None

def push_live_snapshot():
    """Pushes a low-latency frame to backend for live view monitoring."""
    try:
        raw_bytes = capture_hardware_frame()
        if raw_bytes is None:
            return
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        data_url = f"data:image/jpeg;base64,{b64}"

        payload = {
            "camera_id": CAMERA_ID,
            "chamber_id": CHAMBER_ID,
            "frame_data_url": data_url,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        headers = {"X-Gateway-Key": GATEWAY_KEY}
        resp = requests.post(SNAPSHOT_URL, json=payload, headers=headers, timeout=5)
        if resp.status_code == 200:
            logger.debug("Successfully pushed live frame to FloraQ cloud.")
        else:
            logger.warning(f"Live frame upload HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Failed to push live frame: {e}")

def main():
    logger.info(f"Starting FloraQ Camera Daemon for Camera: {CAMERA_ID} in Chamber: {CHAMBER_ID}")
    push_interval = config.get("camera", {}).get("snapshot_push_interval_seconds", 1)

    while True:
        push_live_snapshot()
        time.sleep(push_interval)

if __name__ == "__main__":
    main()
