/**
 * Phytopod 360 — Single ESP32 Firmware for FloraQ Intelligent Plant Trainer
 *
 * Hardware Pinout:
 * - DHT11 (Temp °C / Humidity %): GPIO 4
 * - BH1750 (Light Intensity lux): I2C SDA GPIO 21, SCL GPIO 22
 * - Soil Moisture Sensor 1: GPIO 34 (ADC1_CH6)
 * - Soil Moisture Sensor 2: GPIO 35 (ADC1_CH7)
 *
 * Irrigation Relays (Two 4-Channel Relay Modules; paired Motor + Solenoid Valve):
 * - Zone 1 (Module 1 IN1 + IN2): GPIO 26 -> Motor 1 + Valve 1
 * - Zone 2 (Module 1 IN3 + IN4): GPIO 27 -> Motor 2 + Valve 2
 * - Zone 3 (Module 2 IN1 + IN2): GPIO 18 -> Motor 3 + Valve 3
 * - Zone 4 (Module 2 IN3 + IN4): GPIO 19 -> Motor 4 + Valve 4
 *
 * Communication:
 * - Publishes sensor telemetry & zone state to Firebase RTDB `/telemetry`
 * - Listens for zone commands on Firebase RTDB `/controls/zone1..zone4`
 * - Streams JSON telemetry lines over USB Serial (115200 baud) to Raspberry Pi 4
 */

#include <WiFi.h>
#include <Wire.h>
#include <DHT.h>
#include <BH1750.h>
#include <Firebase_ESP_Client.h>
#include <ArduinoJson.h>

// ---- Wi-Fi & Firebase Credentials (fill Wi-Fi before flashing) ----
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define FIREBASE_API_KEY "AIzaSyDDfTutX8TOvOMjbTTEFbDcY_LiFeWAwZo"
#define FIREBASE_DATABASE_URL "https://plant-chamber-default-rtdb.europe-west1.firebasedatabase.app/"

// ---- Safety Lockout Flag ----
// Keep false until wet-bench / solenoid safety checks are complete.
const bool WATERING_ENABLED = false;
const unsigned long MAX_ZONE_RUNTIME_MS = 15000UL;

// ---- Sensor GPIO Configuration ----
#define DHTPIN 4
#define DHTTYPE DHT11
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
#define SOIL_SENSOR_1_PIN 34
#define SOIL_SENSOR_2_PIN 35

// ---- Irrigation Zone GPIOs (Active LOW or HIGH depending on relay jumper) ----
#define RELAY_ACTIVE_STATE HIGH
#define RELAY_IDLE_STATE LOW
const int ZONE_PINS[4] = {26, 27, 18, 19};

// Calibration ADC values (adjust for capacitive soil sensors)
const int SOIL_DRY_ADC = 3400;
const int SOIL_WET_ADC = 1400;

DHT dht(DHTPIN, DHTTYPE);
BH1750 lightMeter;

FirebaseData fbData;
FirebaseData fbStream;
FirebaseAuth auth;
FirebaseConfig fbConfig;
bool firebaseReady = false;

bool zoneActive[4] = {false, false, false, false};
bool zoneLockout[4] = {false, false, false, false};
unsigned long zoneStartedAt[4] = {0, 0, 0, 0};

unsigned long lastTelemetryMs = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 5000UL;

float mapSoilPercent(int rawAdc) {
  float pct = 100.0f * (float)(SOIL_DRY_ADC - rawAdc) / (float)(SOIL_DRY_ADC - SOIL_WET_ADC);
  if (pct < 0.0f) pct = 0.0f;
  if (pct > 100.0f) pct = 100.0f;
  return roundf(pct * 10.0f) / 10.0f;
}

void setZoneOutput(int idx, bool on) {
  if (!WATERING_ENABLED || zoneLockout[idx]) {
    digitalWrite(ZONE_PINS[idx], RELAY_IDLE_STATE);
    zoneActive[idx] = false;
    return;
  }
  if (on && !zoneActive[idx]) {
    zoneStartedAt[idx] = millis();
  }
  zoneActive[idx] = on;
  digitalWrite(ZONE_PINS[idx], on ? RELAY_ACTIVE_STATE : RELAY_IDLE_STATE);
}

void syncControlsFromFirebase() {
  if (!firebaseReady) return;
  for (int i = 0; i < 4; i++) {
    String path = "/commands/water_zone_" + String(i + 1);
    if (Firebase.RTDB.getInt(&fbData, path.c_str())) {
      int durationSec = fbData.intData();
      setZoneOutput(i, durationSec > 0);
    }
  }
}

void enforceRuntimeLockout() {
  unsigned long now = millis();
  for (int i = 0; i < 4; i++) {
    if (zoneActive[i] && (now - zoneStartedAt[i] >= MAX_ZONE_RUNTIME_MS)) {
      zoneLockout[i] = true;
      setZoneOutput(i, false);
      if (firebaseReady) {
        String cmdPath = "/commands/water_zone_" + String(i + 1);
        Firebase.RTDB.setInt(&fbData, cmdPath.c_str(), 0);
      }
    }
  }
}

void setup() {
  Serial.begin(115200);
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  dht.begin();
  lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE);

  for (int i = 0; i < 4; i++) {
    pinMode(ZONE_PINS[i], OUTPUT);
    digitalWrite(ZONE_PINS[i], RELAY_IDLE_STATE);
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 15000UL) {
    delay(250);
  }

  if (WiFi.status() == WL_CONNECTED) {
    fbConfig.api_key = FIREBASE_API_KEY;
    fbConfig.database_url = FIREBASE_DATABASE_URL;
    if (Firebase.signUp(&fbConfig, &auth, "", "")) {
      firebaseReady = true;
    }
    Firebase.begin(&fbConfig, &auth);
    Firebase.reconnectWiFi(true);
  }
}

void loop() {
  enforceRuntimeLockout();

  if (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = millis();

    syncControlsFromFirebase();

    float tempC = dht.readTemperature();
    float humPct = dht.readHumidity();
    float lux = lightMeter.readLightLevel();

    int rawSoil1 = analogRead(SOIL_SENSOR_1_PIN);
    int rawSoil2 = analogRead(SOIL_SENSOR_2_PIN);
    float soil1 = mapSoilPercent(rawSoil1);
    float soil2 = mapSoilPercent(rawSoil2);
    float soilAvg = roundf(((soil1 + soil2) / 2.0f) * 10.0f) / 10.0f;

    StaticJsonDocument<512> doc;
    doc["device_id"] = "esp32-phytopod-01";
    doc["watering_enabled"] = WATERING_ENABLED;

    JsonObject errors = doc.createNestedObject("sensor_errors");
    if (!isnan(tempC)) doc["temperature"] = roundf(tempC * 10.0f) / 10.0f;
    else errors["temperature"] = "DHT11 read failed on GPIO 4";

    if (!isnan(humPct)) doc["humidity"] = roundf(humPct * 10.0f) / 10.0f;
    else errors["humidity"] = "DHT11 humidity read failed on GPIO 4";

    if (lux >= 0.0f) doc["light_intensity"] = roundf(lux);
    else errors["light_intensity"] = "BH1750 I2C read failed on GPIO 21/22";

    doc["soil_moisture_1"] = soil1;
    doc["soil_moisture_2"] = soil2;
    doc["soil_moisture_average"] = soilAvg;

    JsonObject zones = doc.createNestedObject("zones");
    for (int i = 0; i < 4; i++) {
      JsonObject z = zones.createNestedObject("zone" + String(i + 1));
      z["active"] = zoneActive[i];
      z["lockout"] = zoneLockout[i];
    }

    // 1. Always emit JSON line over USB Serial to Raspberry Pi 4
    serializeJson(doc, Serial);
    Serial.println();

    // 2. Push snapshot to Firebase RTDB /telemetry
    if (firebaseReady && WiFi.status() == WL_CONNECTED) {
      FirebaseJson fbJson;
      String serialized;
      serializeJson(doc, serialized);
      fbJson.setJsonData(serialized);
      fbJson.set("timestamp/.sv", "timestamp");
      Firebase.RTDB.setJSON(&fbData, "/telemetry", &fbJson);
    }
  }
}
