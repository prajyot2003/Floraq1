import React, { useState } from 'react';
import {
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Send,
  Wifi,
  Database,
  Camera,
  Thermometer,
  Droplets,
  Sun,
  Sprout,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import {
  GatewayDevice,
  Plant,
  PhytopodControlState,
  PhytopodHardwareStatus,
  PhytopodTelemetrySnapshot,
  SensorHealthStatus,
} from '../types.js';
import { api } from '../api.js';
import {
  PHYTOPOD_SENSOR_PINS,
  PHYTOPOD_IRRIGATION_ZONES,
  isTimestampStale,
} from '../lib/phytopod.js';
import { FirebaseConnectionState, getFirebaseConfigStatus } from '../lib/firebase.js';
import { IrrigationControlPanel } from './IrrigationControlPanel.js';

interface DeviceManagementProps {
  gateways: GatewayDevice[];
  syncLogs: Array<Record<string, unknown>>;
  plants: Plant[];
  selectedPlantId: string;
  firebaseState: FirebaseConnectionState;
  firebaseError: string | null;
  liveTelemetry: PhytopodTelemetrySnapshot;
  liveControls: PhytopodControlState;
  phytopodStatus: PhytopodHardwareStatus | null;
  onRefreshGateways: () => void;
  onWateringLogged: () => void;
}

export const DeviceManagement: React.FC<DeviceManagementProps> = ({
  plants,
  selectedPlantId,
  firebaseState,
  firebaseError,
  liveTelemetry,
  liveControls,
  phytopodStatus,
  onRefreshGateways,
  onWateringLogged,
}) => {
  const [simPlantId, setSimPlantId] = useState<string>(selectedPlantId || plants[0]?.id || '');
  const [simTemp, setSimTemp] = useState(26.8);
  const [simHum, setSimHum] = useState(71.5);
  const [simSoil1, setSimSoil1] = useState(49.0);
  const [simSoil2, setSimSoil2] = useState(52.0);
  const [simLight, setSimLight] = useState(11800);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simFeedback, setSimFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fbConfig = getFirebaseConfigStatus();

  // Truthful availability calculations (never fabricated online states)
  const isFirebaseOnline = firebaseState === 'connected';
  const hasFreshRtdbTelemetry =
    liveTelemetry.source === 'firebase_rtdb' &&
    liveTelemetry.timestamp !== null &&
    !isTimestampStale(liveTelemetry.timestamp);
  const isEsp32Online = Boolean(hasFreshRtdbTelemetry || phytopodStatus?.esp32?.online);
  const isRpiOnline = Boolean(
    phytopodStatus?.raspberry_pi?.online ||
      (liveTelemetry.rpi_last_seen && !isTimestampStale(liveTelemetry.rpi_last_seen))
  );

  const lastTelemetryTs =
    liveTelemetry.timestamp ||
    phytopodStatus?.raspberry_pi?.last_serial_telemetry_at ||
    phytopodStatus?.esp32?.last_seen_at ||
    null;

  const handleSendSimulatedReading = async () => {
    const targetId = simPlantId || plants[0]?.id;
    if (!targetId) return;
    setIsSimulating(true);
    setSimFeedback(null);
    try {
      const res = await api.sendSimulatedReading({
        plant_id: targetId,
        temperature: simTemp,
        humidity: simHum,
        soil_moisture_1: simSoil1,
        soil_moisture_2: simSoil2,
        light_intensity: simLight,
      });
      setSimFeedback({
        type: 'success',
        text: `Test telemetry packet persisted & broadcast via SSE (${res.items.length} readings · Avg Soil ${((simSoil1 + simSoil2) / 2).toFixed(1)}%).`,
      });
      onRefreshGateways();
    } catch (err) {
      setSimFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Simulation failed',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const renderSensorBadge = (status: SensorHealthStatus) => {
    switch (status) {
      case 'ok':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
            Valid
          </span>
        );
      case 'stale':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
            Stale
          </span>
        );
      case 'error':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-200">
            Sensor Error
          </span>
        );
      case 'missing':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700 border border-gray-200">
            No Data
          </span>
        );
    }
  };

  const formatMetric = (val: number | null, unit: string, status: SensorHealthStatus) => {
    if (status === 'error') return 'ERR';
    if (val === null || val === undefined) return '--';
    return `${val.toLocaleString()} ${unit}`;
  };

  const simSoilAvg = Number(((simSoil1 + simSoil2) / 2).toFixed(1));

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <Cpu className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#174D36]">Phytopod 360 IoT Gateway & Irrigation Control</h1>
          </div>
          <p className="text-xs text-[#718078] mt-1">
            Single ESP32 sensor & relay controller, Raspberry Pi 4 AI/camera host over USB serial, and Firebase Realtime Database live telemetry.
          </p>
        </div>

        <button
          onClick={onRefreshGateways}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] text-xs font-semibold border border-[#E2EAE4] transition self-start md:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Hardware Status</span>
        </button>
      </div>

      {/* 5-Stage Phytopod 360 Hardware & Telemetry Topology */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#174D36]">Phytopod 360 Hardware & Data Pipeline</h3>
          <span className="text-[11px] text-[#718078] flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#39805B]" />
            Last Telemetry:{' '}
            <strong className="text-[#20352A]">
              {lastTelemetryTs ? new Date(lastTelemetryTs).toLocaleString() : 'Awaiting live packet'}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          {/* 1. Physical Sensors */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20352A]">1. Physical Sensors</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  liveTelemetry.sensor_status.temperature === 'ok' ||
                  liveTelemetry.sensor_status.soil_moisture_1 === 'ok'
                    ? 'bg-emerald-500'
                    : 'bg-gray-400'
                }`}
              />
            </div>
            <p className="text-[11px] text-[#718078]">
              DHT11 · BH1750 · Dual Soil Moisture (GPIO 34 & 35)
            </p>
            <div className="text-[10px] text-[#39805B] font-mono">
              Digital · I2C · Dual ADC
            </div>
          </div>

          {/* 2. Single ESP32 Controller */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20352A]">2. Single ESP32</span>
              <span className={`w-2.5 h-2.5 rounded-full ${isEsp32Online ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </div>
            <p className="text-[11px] text-[#718078]">
              Reads sensors, drives 4 zone relays, writes Firebase RTDB
            </p>
            <div className="text-[10px] text-[#39805B] font-mono">
              {isEsp32Online ? 'Online · Active Telemetry' : 'Offline / Awaiting Heartbeat'}
            </div>
          </div>

          {/* 3. Raspberry Pi 4 */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20352A]">3. Raspberry Pi 4</span>
              <span className={`w-2.5 h-2.5 rounded-full ${isRpiOnline ? 'bg-emerald-500' : 'bg-gray-400'}`} />
            </div>
            <p className="text-[11px] text-[#718078]">
              USB Serial JSON reader, RPi Camera & Python AI Pipeline
            </p>
            <div className="text-[10px] text-[#718078] font-mono">
              {isRpiOnline ? 'Online · Serial & AI Host' : 'Offline / Standby'}
            </div>
          </div>

          {/* 4. Firebase Realtime Database */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20352A]">4. Firebase RTDB</span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isFirebaseOnline
                    ? 'bg-emerald-500'
                    : firebaseState === 'unconfigured'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
              />
            </div>
            <p className="text-[11px] text-[#718078]">
              Live sync at <code className="font-mono">/telemetry</code> &{' '}
              <code className="font-mono">/commands</code>
            </p>
            <div className="text-[10px] text-[#39805B] font-mono">
              {firebaseState === 'connected'
                ? 'Connected (Live)'
                : firebaseState === 'unconfigured'
                ? 'Not Configured'
                : firebaseState}
            </div>
          </div>

          {/* 5. FloraQ Web Dashboard */}
          <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#20352A]">5. FloraQ Dashboard</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <p className="text-[11px] text-[#718078]">
              Live UI listeners, 4-zone commands, Groq AI diagnostics & logs
            </p>
            <div className="text-[10px] text-[#39805B] font-mono">Active Web Client</div>
          </div>
        </div>
      </div>

      {/* Live Connectivity & Sensor Availability Status Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connectivity & Subsystem Availability */}
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-[#174D36] flex items-center gap-2">
            <Wifi className="w-4 h-4 text-[#39805B]" />
            Device & Database Connectivity
          </h3>

          <div className="space-y-2.5 text-xs">
            {/* Firebase RTDB */}
            <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#39805B]" />
                <div>
                  <div className="font-bold text-[#20352A]">Firebase Realtime Database</div>
                  <div className="text-[10px] text-[#718078] font-mono">
                    {fbConfig.databaseUrl || 'VITE_FIREBASE_DATABASE_URL not set'}
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                  isFirebaseOnline
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : firebaseState === 'unconfigured'
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-rose-100 text-rose-800 border-rose-300'
                }`}
              >
                {firebaseState}
              </span>
            </div>

            {/* ESP32 */}
            <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-[#39805B]" />
                <div>
                  <div className="font-bold text-[#20352A]">ESP32 Controller (esp32-phytopod-01)</div>
                  <div className="text-[10px] text-[#718078]">
                    {phytopodStatus?.esp32?.last_seen_at || liveTelemetry.esp32_last_seen
                      ? `Last seen: ${new Date(
                          (liveTelemetry.esp32_last_seen || phytopodStatus?.esp32?.last_seen_at)!
                        ).toLocaleTimeString()}`
                      : 'No live telemetry received yet'}
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                  isEsp32Online
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-700 border-gray-300'
                }`}
              >
                {isEsp32Online ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Raspberry Pi 4 */}
            <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#39805B]" />
                <div>
                  <div className="font-bold text-[#20352A]">Raspberry Pi 4 (AI & Camera)</div>
                  <div className="text-[10px] text-[#718078]">
                    {phytopodStatus?.raspberry_pi?.last_seen_at
                      ? `Heartbeat: ${new Date(phytopodStatus.raspberry_pi.last_seen_at).toLocaleTimeString()}`
                      : 'No RPi heartbeat received yet'}
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                  isRpiOnline
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-gray-100 text-gray-700 border-gray-300'
                }`}
              >
                {isRpiOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            {/* Firmware WATERING_ENABLED */}
            <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <div>
                  <div className="font-bold text-[#20352A]">Firmware Safety Gate</div>
                  <div className="text-[10px] text-[#718078] font-mono">WATERING_ENABLED</div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                  liveTelemetry.watering_flag_present && !liveTelemetry.watering_enabled
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                }`}
              >
                {liveTelemetry.watering_flag_present
                  ? liveTelemetry.watering_enabled
                    ? 'true (Armed)'
                    : 'false (Locked)'
                  : 'Command Mode (/commands)'}
              </span>
            </div>

            {firebaseError && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-2">
                <div className="font-semibold">{firebaseError}</div>
                {firebaseError.toLowerCase().includes('permission') && (
                  <pre className="p-2 rounded bg-white/80 border border-amber-200 text-[10px] font-mono text-[#20352A] overflow-x-auto">{`{
  "rules": {
    "telemetry": { ".read": true, ".write": true },
    "commands":  { ".read": true, ".write": true }
  }
}`}</pre>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live Sensor Availability & Readings from RTDB / Serial */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#174D36]">Live Phytopod 360 Sensor Availability</h3>
              <p className="text-[11px] text-[#718078]">
                Reads strictly from live hardware telemetry. Missing, sensor error, and stale states are never fabricated or confused with 0.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {liveTelemetry.validation?.has_sensor_error && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-[10px] font-bold uppercase text-rose-800">
                  <AlertTriangle className="w-3 h-3" />
                  Sensor Error
                </span>
              )}
              <span className="px-2 py-0.5 rounded bg-[#F7FAF7] border border-[#E2EAE4] text-[10px] font-mono text-[#718078]">
                Source: {liveTelemetry.source === 'none' ? 'No Live Packet' : liveTelemetry.source}
              </span>
            </div>
          </div>

          {liveTelemetry.validation?.has_sensor_error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5 text-rose-800">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Sensor Error Detected
                </span>
                <span className="text-[10px] font-mono text-rose-700">
                  Validated: {new Date(liveTelemetry.validation.validated_at).toLocaleTimeString()}
                </span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-rose-800">
                {liveTelemetry.validation.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {/* Temperature */}
            <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#718078] flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5 text-orange-600" />
                  Temperature (DHT11)
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.temperature)}
              </div>
              <div className="text-lg font-bold text-[#20352A]">
                {formatMetric(liveTelemetry.temperature, '°C', liveTelemetry.sensor_status.temperature)}
              </div>
              <div className="text-[10px] text-[#718078] font-mono">GPIO 4</div>
            </div>

            {/* Humidity */}
            <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#718078] flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-blue-600" />
                  Humidity (DHT11)
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.humidity)}
              </div>
              <div className="text-lg font-bold text-[#20352A]">
                {formatMetric(liveTelemetry.humidity, '%', liveTelemetry.sensor_status.humidity)}
              </div>
              <div className="text-[10px] text-[#718078] font-mono">GPIO 4</div>
            </div>

            {/* Light Intensity */}
            <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#718078] flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                  Light (BH1750)
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.light_intensity)}
              </div>
              <div className="text-lg font-bold text-[#20352A]">
                {formatMetric(liveTelemetry.light_intensity, 'lx', liveTelemetry.sensor_status.light_intensity)}
              </div>
              <div className="text-[10px] text-[#718078] font-mono">SDA 21 · SCL 22</div>
            </div>

            {/* Soil Moisture 1 */}
            <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#718078] flex items-center gap-1">
                  <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                  Soil Moisture 1
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.soil_moisture_1)}
              </div>
              <div className="text-lg font-bold text-[#20352A]">
                {formatMetric(liveTelemetry.soil_moisture_1, '%', liveTelemetry.sensor_status.soil_moisture_1)}
              </div>
              <div className="text-[10px] text-[#718078] font-mono">GPIO 34 (ADC)</div>
            </div>

            {/* Soil Moisture 2 */}
            <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#718078] flex items-center gap-1">
                  <Sprout className="w-3.5 h-3.5 text-emerald-600" />
                  Soil Moisture 2
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.soil_moisture_2)}
              </div>
              <div className="text-lg font-bold text-[#20352A]">
                {formatMetric(liveTelemetry.soil_moisture_2, '%', liveTelemetry.sensor_status.soil_moisture_2)}
              </div>
              <div className="text-[10px] text-[#718078] font-mono">GPIO 35 (ADC)</div>
            </div>

            {/* Average Soil Moisture */}
            <div className="p-3.5 rounded-xl bg-[#DCEFE2]/50 border border-[#39805B]/30 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#174D36] flex items-center gap-1">
                  <Sprout className="w-3.5 h-3.5 text-[#174D36]" />
                  Avg Soil Moisture
                </span>
                {renderSensorBadge(liveTelemetry.sensor_status.soil_moisture_average)}
              </div>
              <div className="text-lg font-bold text-[#174D36]">
                {formatMetric(liveTelemetry.soil_moisture_average, '%', liveTelemetry.sensor_status.soil_moisture_average)}
              </div>
              <div className="text-[10px] text-[#39805B] font-mono">Mean(GPIO 34, GPIO 35)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Phase 4: Four-Zone Irrigation Control & Safety Panel */}
      <IrrigationControlPanel
        firebaseState={firebaseState}
        telemetry={liveTelemetry}
        controls={liveControls}
        selectedPlantId={selectedPlantId || plants[0]?.id}
        onWateringLogged={onWateringLogged}
      />

      {/* Hardware Pinout & Relay Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-[#174D36]">ESP32 Sensor GPIO Configuration</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-2.5">Sensor</th>
                  <th className="p-2.5">ESP32 Pin</th>
                  <th className="p-2.5">Interface</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {PHYTOPOD_SENSOR_PINS.map((row) => (
                  <tr key={row.sensor}>
                    <td className="p-2.5 font-semibold">{row.sensor}</td>
                    <td className="p-2.5 font-mono text-[#174D36] font-bold">{row.gpio}</td>
                    <td className="p-2.5 text-[#718078]">{row.bus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-[#174D36]">Relay Module & Irrigation Zone Mapping</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-2.5">Zone</th>
                  <th className="p-2.5">GPIO</th>
                  <th className="p-2.5">Relay Inputs</th>
                  <th className="p-2.5">Paired Actuators</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {PHYTOPOD_IRRIGATION_ZONES.map((z) => (
                  <tr key={z.id}>
                    <td className="p-2.5 font-semibold">{z.label}</td>
                    <td className="p-2.5 font-mono text-[#174D36] font-bold">{z.gpio}</td>
                    <td className="p-2.5 font-mono text-[#718078]">
                      {z.relayModule.replace('Relay ', '')} {z.relayInputs}
                    </td>
                    <td className="p-2.5">{z.devices}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Software Test Bench (Explicitly Tagged SIMULATOR_TEST) */}
      <div className="bg-white rounded-2xl border border-[#39805B]/30 p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2EAE4]">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#174D36]">Historical Chart & SSE Test Bench</h3>
              <p className="text-xs text-[#718078]">
                Inject synthetic sensor packets into the local chart history (tagged <code className="font-mono">simulator_test</code>; does not alter Firebase RTDB <code className="font-mono">/telemetry</code>).
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            TEST MODE · SIMULATOR_TEST
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="text-xs font-semibold text-[#20352A] block mb-1">Target Plant Plan</label>
            <select
              value={simPlantId}
              onChange={(e) => setSimPlantId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plan_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20352A] block mb-1">Temp (DHT11): {simTemp} °C</label>
            <input
              type="range"
              min="15"
              max="38"
              step="0.1"
              value={simTemp}
              onChange={(e) => setSimTemp(Number(e.target.value))}
              className="w-full accent-[#174D36]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20352A] block mb-1">Humidity (DHT11): {simHum} %</label>
            <input
              type="range"
              min="30"
              max="95"
              step="0.5"
              value={simHum}
              onChange={(e) => setSimHum(Number(e.target.value))}
              className="w-full accent-[#174D36]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20352A] block mb-1">Soil 1 (GPIO 34): {simSoil1} %</label>
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={simSoil1}
              onChange={(e) => setSimSoil1(Number(e.target.value))}
              className="w-full accent-[#174D36]"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#20352A] block mb-1">Soil 2 (GPIO 35): {simSoil2} %</label>
            <input
              type="range"
              min="0"
              max="100"
              step="0.5"
              value={simSoil2}
              onChange={(e) => setSimSoil2(Number(e.target.value))}
              className="w-full accent-[#174D36]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#718078]">
            <span>
              Computed Avg Soil Moisture: <strong className="text-[#174D36]">{simSoilAvg} %</strong>
            </span>
            <label className="flex items-center gap-2">
              <span>Light (BH1750 lux):</span>
              <input
                type="number"
                min="0"
                max="65535"
                step="100"
                value={simLight}
                onChange={(e) => setSimLight(Number(e.target.value))}
                className="w-24 px-2 py-1 rounded border border-[#E2EAE4] bg-[#F7FAF7] text-[#20352A] font-mono"
              />
            </label>
          </div>
          <button
            onClick={handleSendSimulatedReading}
            disabled={isSimulating || plants.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isSimulating ? 'Injecting...' : 'Inject Test Telemetry Packet'}</span>
          </button>
        </div>

        {simFeedback && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
              simFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {simFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{simFeedback.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};
