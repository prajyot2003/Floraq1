import React, { useState } from 'react';
import {
  Thermometer,
  Droplets,
  Sun,
  Sprout,
  Video,
  BrainCircuit,
  FileSpreadsheet,
  GitBranch,
  ArrowLeft,
  Scale,
  FlaskConical,
  Plus,
  Cpu,
  AlertTriangle,
} from 'lucide-react';
import {
  Plant,
  GrowthCycle,
  SensorReading,
  CareEvent,
  DailyObservation,
  PhytopodTelemetrySnapshot,
  SensorHealthStatus,
} from '../types.js';
import { InteractiveCharts } from './InteractiveCharts.js';
import { FirebaseConnectionState } from '../lib/firebase.js';
import { PHYTOPOD_IRRIGATION_ZONES, isTimestampStale } from '../lib/phytopod.js';

interface PlantDetailProps {
  plant: Plant;
  cycles: GrowthCycle[];
  activeCycle: GrowthCycle | null;
  readings: SensorReading[];
  careEvents: CareEvent[];
  observations: DailyObservation[];
  liveTelemetry?: PhytopodTelemetrySnapshot;
  firebaseState?: FirebaseConnectionState;
  onBack: () => void;
  onOpenObservationModal: () => void;
  onOpenCareEventModal: () => void;
  onOpenLiveCamera: () => void;
  onOpenAIDiagnosis: () => void;
  onOpenNewCycle: () => void;
  onOpenIoTGateway: () => void;
  onExportCSV: () => void;
}

type ChartParam =
  | 'temperature'
  | 'humidity'
  | 'soil_moisture_1'
  | 'soil_moisture_2'
  | 'soil_moisture_average'
  | 'light_intensity';

export const PlantDetail: React.FC<PlantDetailProps> = ({
  plant,
  activeCycle,
  readings,
  careEvents,
  observations,
  liveTelemetry,
  firebaseState,
  onBack,
  onOpenObservationModal,
  onOpenCareEventModal,
  onOpenLiveCamera,
  onOpenAIDiagnosis,
  onOpenNewCycle,
  onOpenIoTGateway,
  onExportCSV,
}) => {
  const [selectedChartParam, setSelectedChartParam] = useState<ChartParam>('temperature');
  const [timeFilter, setTimeFilter] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  const getFilteredReadings = () => {
    const now = Date.now();
    let cutoff = 0;
    if (timeFilter === '24h') cutoff = now - 24 * 3600000;
    else if (timeFilter === '7d') cutoff = now - 7 * 86400000;
    else if (timeFilter === '30d') cutoff = now - 30 * 86400000;

    return readings.filter((r) => cutoff === 0 || new Date(r.device_timestamp).getTime() >= cutoff);
  };

  const filteredReadings = getFilteredReadings();

  const getLatestReading = (param: string) => {
    const list = readings.filter((r) => r.parameter_name === param);
    if (list.length === 0) return null;
    return list.sort((a, b) => new Date(b.device_timestamp).getTime() - new Date(a.device_timestamp).getTime())[0];
  };

  const hasRtdbData = firebaseState === 'connected' && liveTelemetry?.source === 'firebase_rtdb';

  const resolveSensorCard = (
    rtdbVal: number | null | undefined,
    rtdbStatus: SensorHealthStatus | undefined,
    readingParam: string,
    fallbackParam?: string
  ): { value: number | null; status: SensorHealthStatus; timestamp: string | null; sourceLabel: string } => {
    if (hasRtdbData) {
      return {
        value: rtdbVal ?? null,
        status: rtdbStatus ?? (rtdbVal !== null && rtdbVal !== undefined ? 'ok' : 'missing'),
        timestamp: liveTelemetry?.timestamp ?? null,
        sourceLabel: 'Firebase RTDB',
      };
    }

    const r = getLatestReading(readingParam) || (fallbackParam ? getLatestReading(fallbackParam) : null);
    if (!r) {
      return { value: null, status: 'missing', timestamp: null, sourceLabel: 'No Data' };
    }
    if (r.quality_status === 'error') {
      return { value: null, status: 'error', timestamp: r.device_timestamp, sourceLabel: 'Sensor Error' };
    }
    const stale = r.quality_status === 'stale' || isTimestampStale(r.device_timestamp, 3600_000);
    return {
      value: r.value,
      status: stale ? 'stale' : 'ok',
      timestamp: r.device_timestamp,
      sourceLabel:
        r.data_source === 'simulator_test'
          ? 'Test Bench'
          : r.data_source === 'usb_serial'
          ? 'USB Serial'
          : 'Logged Telemetry',
    };
  };

  const tempCard = resolveSensorCard(liveTelemetry?.temperature, liveTelemetry?.sensor_status.temperature, 'temperature');
  const humCard = resolveSensorCard(liveTelemetry?.humidity, liveTelemetry?.sensor_status.humidity, 'humidity');
  const lightCard = resolveSensorCard(
    liveTelemetry?.light_intensity,
    liveTelemetry?.sensor_status.light_intensity,
    'light_intensity'
  );
  const soil1Card = resolveSensorCard(
    liveTelemetry?.soil_moisture_1,
    liveTelemetry?.sensor_status.soil_moisture_1,
    'soil_moisture_1'
  );
  const soil2Card = resolveSensorCard(
    liveTelemetry?.soil_moisture_2,
    liveTelemetry?.sensor_status.soil_moisture_2,
    'soil_moisture_2'
  );
  const soilAvgCard = resolveSensorCard(
    liveTelemetry?.soil_moisture_average,
    liveTelemetry?.sensor_status.soil_moisture_average,
    'soil_moisture_average',
    'soil_moisture'
  );

  const renderStatusPill = (status: SensorHealthStatus, fallbackLabel: string) => {
    if (status === 'error') {
      return <span className="text-rose-600 font-semibold">Sensor Error</span>;
    }
    if (status === 'missing') {
      return <span className="text-[#718078] font-medium">Missing</span>;
    }
    if (status === 'stale') {
      return <span className="text-amber-600 font-medium">Stale</span>;
    }
    return <span className="text-emerald-600 font-medium">{fallbackLabel}</span>;
  };

  const formatCardValue = (val: number | null, unit: string, status: SensorHealthStatus) => {
    if (status === 'error') return 'ERR';
    if (val === null || val === undefined) return '--';
    return `${val.toLocaleString()} ${unit}`;
  };

  // Latest manual observation values (never fabricate if none exist)
  const latestObs = observations[0] || null;
  const currentHeight = latestObs?.plant_height ?? null;
  const currentPh = latestObs?.soil_ph ?? null;

  const targetTemp = activeCycle?.initial_targets?.temperature ?? 27.0;
  const targetHum = activeCycle?.initial_targets?.humidity ?? 72.0;
  const targetSoil = activeCycle?.initial_targets?.soil_moisture ?? 50.0;
  const targetLight = activeCycle?.initial_targets?.light_intensity ?? 12000;

  // Care summaries
  const lastWatering = careEvents.find((c) => c.event_type === 'watering');
  const lastFertilizer = careEvents.find((c) => c.event_type === 'fertilizer');
  const lastTreatment = careEvents.find((c) => c.event_type === 'treatment' || c.event_type === 'training');

  // If user selects soil_moisture_average when only legacy soil_moisture exists, pass normalized chart parameter
  const chartParamForData =
    selectedChartParam === 'soil_moisture_average' &&
    !filteredReadings.some((r) => r.parameter_name === 'soil_moisture_average') &&
    filteredReadings.some((r) => r.parameter_name === 'soil_moisture')
      ? 'soil_moisture'
      : selectedChartParam;

  return (
    <div className="space-y-6">
      {/* Top Header Navigation */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] transition border border-[#E2EAE4]"
            title="Back to all plans"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#39805B]">{plant.plan_name}</span>
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[#DCEFE2] text-[#174D36]">
                {activeCycle ? activeCycle.cycle_name : 'Cycle 1'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-[#20352A]">{plant.plant_name}</h1>
            <p className="text-xs text-[#718078] italic">{plant.species} · Chamber: {plant.chamber_id}</p>
          </div>
        </div>

        {/* Quick Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenObservationModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] text-xs font-semibold border border-[#E2EAE4] transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Daily Observation</span>
          </button>
          <button
            onClick={onOpenCareEventModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] text-xs font-semibold border border-[#E2EAE4] transition"
          >
            <Droplets className="w-3.5 h-3.5 text-blue-500" />
            <span>Record Care Event</span>
          </button>
          <button
            onClick={onOpenLiveCamera}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Live Camera</span>
          </button>
          <button
            onClick={onOpenAIDiagnosis}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#39805B] hover:bg-[#43966B] text-white text-xs font-semibold shadow-sm transition"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>AI Health</span>
          </button>
          <button
            onClick={onExportCSV}
            className="p-2 rounded-lg bg-[#F7FAF7] hover:bg-[#E2EAE4] text-[#20352A] transition border border-[#E2EAE4]"
            title="Download CSV Telemetry Export"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#39805B]" />
          </button>
        </div>
      </div>

      {/* Sensor Validation Alert Banner */}
      {firebaseState === 'connected' && liveTelemetry?.validation?.has_sensor_error && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5 text-rose-900">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-[10px] font-bold uppercase text-rose-800">
                  Sensor Error
                </span>
                <span className="text-xs font-bold text-rose-900">
                  Live Firebase telemetry validation failed
                </span>
              </div>
              <ul className="list-disc pl-4 text-[11px] text-rose-800 space-y-0.5">
                {liveTelemetry.validation.issues.map((issue, idx) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
          <button
            onClick={onOpenIoTGateway}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-semibold transition"
          >
            Inspect IoT Gateway
          </button>
        </div>
      )}

      {/* Phytopod 360 Environmental Sensor Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Temperature (DHT11 GPIO 4) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Temp (DHT11)</span>
            <div className="p-1 rounded bg-orange-50 text-orange-600">
              <Thermometer className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {formatCardValue(tempCard.value, '°C', tempCard.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(tempCard.status, tempCard.sourceLabel)}
            <span>GPIO 4 · Target {targetTemp}°C</span>
          </div>
        </div>

        {/* Humidity (DHT11 GPIO 4) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Humidity (DHT11)</span>
            <div className="p-1 rounded bg-blue-50 text-blue-600">
              <Droplets className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {formatCardValue(humCard.value, '%', humCard.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(humCard.status, humCard.sourceLabel)}
            <span>GPIO 4 · Target {targetHum}%</span>
          </div>
        </div>

        {/* Light Intensity (BH1750 SDA 21 / SCL 22) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Light (BH1750)</span>
            <div className="p-1 rounded bg-amber-50 text-amber-600">
              <Sun className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1 truncate">
            {formatCardValue(lightCard.value, 'lx', lightCard.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(lightCard.status, lightCard.sourceLabel)}
            <span>SDA21/SCL22</span>
          </div>
        </div>

        {/* Average Soil Moisture */}
        <div className="bg-white p-3.5 rounded-xl border border-[#39805B]/30 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#174D36]">Avg Soil Moisture</span>
            <div className="p-1 rounded bg-[#DCEFE2] text-[#174D36]">
              <Sprout className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#174D36] mt-1">
            {formatCardValue(soilAvgCard.value, '%', soilAvgCard.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(soilAvgCard.status, soilAvgCard.sourceLabel)}
            <span>Target {targetSoil}%</span>
          </div>
        </div>

        {/* Soil Moisture 1 (GPIO 34) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Soil Moisture 1</span>
            <div className="p-1 rounded bg-emerald-50 text-emerald-600">
              <Sprout className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {formatCardValue(soil1Card.value, '%', soil1Card.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(soil1Card.status, soil1Card.sourceLabel)}
            <span>GPIO 34</span>
          </div>
        </div>

        {/* Soil Moisture 2 (GPIO 35) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Soil Moisture 2</span>
            <div className="p-1 rounded bg-emerald-50 text-emerald-600">
              <Sprout className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {formatCardValue(soil2Card.value, '%', soil2Card.status)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            {renderStatusPill(soil2Card.status, soil2Card.sourceLabel)}
            <span>GPIO 35</span>
          </div>
        </div>

        {/* Soil pH (Manual Observations) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Soil pH</span>
            <div className="p-1 rounded bg-purple-50 text-purple-600">
              <FlaskConical className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {currentPh !== null ? `${currentPh} pH` : '--'}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            <span className="text-[#39805B] font-medium">
              {currentPh !== null ? 'Manual Log' : 'Not Logged'}
            </span>
            <span>Optimal: 6.2–6.8</span>
          </div>
        </div>

        {/* Plant Height (Manual Observations) */}
        <div className="bg-white p-3.5 rounded-xl border border-[#E2EAE4] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-[#718078]">Plant Height</span>
            <div className="p-1 rounded bg-teal-50 text-teal-600">
              <Scale className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-[#20352A] mt-1">
            {currentHeight !== null ? `${currentHeight} cm` : '--'}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#718078] mt-1 pt-1 border-t border-[#E2EAE4]">
            <span className="text-[#39805B] font-medium">
              {currentHeight !== null ? 'Manual Caliper' : 'Not Logged'}
            </span>
            <span>{latestObs ? new Date(latestObs.observed_at).toLocaleDateString() : '--'}</span>
          </div>
        </div>
      </div>

      {/* 4-Zone Irrigation Quick Status Strip */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#174D36]">
            <Cpu className="w-4 h-4 text-[#39805B]" />
            <span>Irrigation Zones (ESP32):</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PHYTOPOD_IRRIGATION_ZONES.map((z) => {
              const st = liveTelemetry?.zones[z.id];
              return (
                <span
                  key={z.id}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                    st?.lockout
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : st?.active
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-[#F7FAF7] text-[#718078] border-[#E2EAE4]'
                  }`}
                >
                  {z.label} (GPIO {z.gpio}): {st?.lockout ? 'Lockout' : st?.active ? 'Active' : 'Idle'}
                </span>
              );
            })}
          </div>
        </div>
        <button
          onClick={onOpenIoTGateway}
          className="px-3 py-1.5 rounded-lg bg-[#DCEFE2] hover:bg-[#c8e7d1] text-[#174D36] text-xs font-semibold transition"
        >
          Manage Irrigation & Hardware
        </button>
      </div>

      {/* Grid: Care Information & Active Cycle Targets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plant Care Summary Card */}
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2EAE4]">
            <h3 className="text-sm font-bold text-[#174D36] flex items-center gap-1.5">
              <Droplets className="w-4 h-4 text-blue-600" />
              Plant Care History
            </h3>
            <button
              onClick={onOpenCareEventModal}
              className="text-xs font-semibold text-[#39805B] hover:text-[#174D36]"
            >
              + Record
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
              <div className="text-[#718078] text-[10px] font-bold uppercase">Last Watering Event</div>
              <div className="font-semibold text-[#20352A] mt-0.5">
                {lastWatering
                  ? `${lastWatering.zone ? `${lastWatering.zone.toUpperCase()} · ` : ''}${
                      lastWatering.duration_seconds
                        ? `${lastWatering.duration_seconds}s`
                        : lastWatering.quantity
                        ? `${lastWatering.quantity} ${lastWatering.unit}`
                        : lastWatering.method || 'Logged'
                    }`
                  : 'None logged'}
              </div>
              <div className="text-[11px] text-[#718078] mt-0.5">
                {lastWatering ? new Date(lastWatering.event_time).toLocaleString() : 'Awaiting watering'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
              <div className="text-[#718078] text-[10px] font-bold uppercase">Last Fertilizer Application</div>
              <div className="font-semibold text-[#20352A] mt-0.5">
                {lastFertilizer
                  ? `${lastFertilizer.product_name || 'Nutrient'} (${lastFertilizer.quantity ?? '--'} ${lastFertilizer.unit ?? ''})`
                  : 'None logged'}
              </div>
              <div className="text-[11px] text-[#718078] mt-0.5">
                {lastFertilizer ? new Date(lastFertilizer.event_time).toLocaleString() : 'No dosing'}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
              <div className="text-[#718078] text-[10px] font-bold uppercase">Last Botanical Training / Pruning</div>
              <div className="font-semibold text-[#20352A] mt-0.5">
                {lastTreatment ? `${lastTreatment.notes || lastTreatment.method}` : 'None logged'}
              </div>
              <div className="text-[11px] text-[#718078] mt-0.5">
                {lastTreatment ? new Date(lastTreatment.event_time).toLocaleString() : 'Standard canopy'}
              </div>
            </div>
          </div>
        </div>

        {/* Active Cycle & Environmental Targets */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2EAE4]">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-[#174D36]" />
              <h3 className="text-sm font-bold text-[#174D36]">
                {activeCycle ? activeCycle.cycle_name : 'Current Active Cycle'}
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800">
                ACTIVE
              </span>
            </div>
            <button
              onClick={onOpenNewCycle}
              className="text-xs font-semibold text-[#39805B] hover:text-[#174D36]"
            >
              + Create New Cycle
            </button>
          </div>

          <p className="text-xs text-[#20352A]">
            <strong className="font-semibold text-[#174D36]">Cycle Objective:</strong>{' '}
            {activeCycle?.objective || 'Establish baseline growth parameters and environmental setpoints.'}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-center">
              <span className="text-[10px] text-[#718078] uppercase font-bold">Target Temp</span>
              <div className="text-sm font-bold text-[#174D36] mt-0.5">{targetTemp} °C</div>
              <span className="text-[9px] text-[#718078]">DHT11 · GPIO 4</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-center">
              <span className="text-[10px] text-[#718078] uppercase font-bold">Target Humidity</span>
              <div className="text-sm font-bold text-[#174D36] mt-0.5">{targetHum} %</div>
              <span className="text-[9px] text-[#718078]">DHT11 · GPIO 4</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-center">
              <span className="text-[10px] text-[#718078] uppercase font-bold">Target Avg Soil</span>
              <div className="text-sm font-bold text-[#174D36] mt-0.5">{targetSoil} %</div>
              <span className="text-[9px] text-[#718078]">GPIO 34 + 35 Mean</span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-center">
              <span className="text-[10px] text-[#718078] uppercase font-bold">Target Light</span>
              <div className="text-sm font-bold text-[#174D36] mt-0.5">{targetLight.toLocaleString()} lx</div>
              <span className="text-[9px] text-[#718078]">BH1750 · I2C</span>
            </div>
          </div>

          <div className="p-2.5 rounded-lg bg-[#DCEFE2]/60 border border-[#39805B]/20 text-[11px] text-[#174D36] flex items-center justify-between">
            <span>
              Cycle started: {activeCycle ? new Date(activeCycle.start_at).toLocaleDateString() : 'N/A'}
            </span>
            <span className="font-semibold">
              Historical cycles safely archived & preserved
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Historical Charts Section */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#174D36]">Historical Sensor Telemetry Trends</h3>
            <p className="text-xs text-[#718078]">Recorded environmental & dual-soil moisture telemetry with timestamps.</p>
          </div>

          <div className="flex items-center gap-1 bg-[#F7FAF7] p-1 rounded-lg border border-[#E2EAE4]">
            {(['24h', '7d', '30d', 'all'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                  timeFilter === t
                    ? 'bg-[#174D36] text-white font-semibold'
                    : 'text-[#718078] hover:text-[#20352A]'
                }`}
              >
                {t === '24h' ? 'Last 24 Hours' : t === '7d' ? 'Last 7 Days' : t === '30d' ? 'Last 30 Days' : 'Full Cycle'}
              </button>
            ))}
          </div>
        </div>

        {/* Parameter Selector Tabs */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() => setSelectedChartParam('temperature')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'temperature'
                ? 'bg-orange-50 text-orange-800 border-orange-200 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>Temperature (°C)</span>
          </button>

          <button
            onClick={() => setSelectedChartParam('humidity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'humidity'
                ? 'bg-blue-50 text-blue-800 border-blue-200 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Humidity (%)</span>
          </button>

          <button
            onClick={() => setSelectedChartParam('soil_moisture_1')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'soil_moisture_1'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" />
            <span>Soil 1 (GPIO 34)</span>
          </button>

          <button
            onClick={() => setSelectedChartParam('soil_moisture_2')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'soil_moisture_2'
                ? 'bg-teal-50 text-teal-800 border-teal-200 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" />
            <span>Soil 2 (GPIO 35)</span>
          </button>

          <button
            onClick={() => setSelectedChartParam('soil_moisture_average')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'soil_moisture_average'
                ? 'bg-[#DCEFE2] text-[#174D36] border-[#39805B]/40 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" />
            <span>Avg Soil Moisture (%)</span>
          </button>

          <button
            onClick={() => setSelectedChartParam('light_intensity')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
              selectedChartParam === 'light_intensity'
                ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-xs'
                : 'bg-white text-[#718078] border-[#E2EAE4]'
            }`}
          >
            <Sun className="w-3.5 h-3.5" />
            <span>Light Intensity (lux)</span>
          </button>
        </div>

        {/* Selected Chart Rendering */}
        <InteractiveCharts
          readings={filteredReadings}
          parameterName={chartParamForData}
          unit={
            selectedChartParam === 'temperature'
              ? '°C'
              : selectedChartParam === 'light_intensity'
              ? 'lux'
              : '%'
          }
          targetValue={
            selectedChartParam === 'temperature'
              ? targetTemp
              : selectedChartParam === 'humidity'
              ? targetHum
              : selectedChartParam === 'light_intensity'
              ? targetLight
              : targetSoil
          }
          color={
            selectedChartParam === 'temperature'
              ? '#EA580C'
              : selectedChartParam === 'humidity'
              ? '#2563EB'
              : selectedChartParam === 'light_intensity'
              ? '#D97706'
              : selectedChartParam === 'soil_moisture_2'
              ? '#0D9488'
              : '#059669'
          }
          title={
            selectedChartParam === 'temperature'
              ? 'Temperature (DHT11 GPIO 4)'
              : selectedChartParam === 'humidity'
              ? 'Relative Humidity (DHT11 GPIO 4)'
              : selectedChartParam === 'soil_moisture_1'
              ? 'Soil Moisture 1 (GPIO 34)'
              : selectedChartParam === 'soil_moisture_2'
              ? 'Soil Moisture 2 (GPIO 35)'
              : selectedChartParam === 'soil_moisture_average'
              ? 'Average Soil Moisture (GPIO 34 & 35)'
              : 'Light Intensity (BH1750)'
          }
        />
      </div>
    </div>
  );
};
