import React, { useState } from 'react';
import {
  Plus,
  Thermometer,
  Droplets,
  Sun,
  Sprout,
  Clock,
  ChevronRight,
  GitBranch,
  Video,
  BrainCircuit,
  Trash2,
  Archive,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Plant, PhytopodTelemetrySnapshot } from '../types.js';
import { FirebaseConnectionState } from '../lib/firebase.js';

interface DashboardProps {
  plants: Plant[];
  liveTelemetry?: PhytopodTelemetrySnapshot;
  firebaseState?: FirebaseConnectionState;
  onSelectPlant: (plantId: string) => void;
  onOpenAddPlant: () => void;
  onOpenNewCycle: (plantId: string) => void;
  onOpenLiveCamera: (plantId: string) => void;
  onOpenAIDiagnosis: (plantId: string) => void;
  onDeletePlant: (plantId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  plants,
  liveTelemetry,
  firebaseState,
  onSelectPlant,
  onOpenAddPlant,
  onOpenNewCycle,
  onOpenLiveCamera,
  onOpenAIDiagnosis,
  onDeletePlant,
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  const filteredPlants = plants.filter(
    (p) =>
      p.plan_name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      p.plant_name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      p.species.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const getFreshness = (timestamp?: string | null) => {
    if (!timestamp) return { label: 'Awaiting Telemetry', color: 'bg-amber-100 text-amber-800 border-amber-200' };
    const diffMin = (Date.now() - new Date(timestamp).getTime()) / 60000;
    if (diffMin <= 5) {
      return { label: 'Live (< 5m)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
    if (diffMin <= 60) {
      return { label: `Updated ${Math.round(diffMin)}m ago`, color: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
    }
    return { label: 'Stale (> 1h)', color: 'bg-amber-50 text-amber-700 border-amber-200' };
  };

  const hasLiveRtdbPacket =
    firebaseState === 'connected' && liveTelemetry?.source === 'firebase_rtdb';

  return (
    <div className="space-y-6">
      {/* Top Banner Overview */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[#174D36]">Autonomous Plant Trainer Chamber</h1>
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#DCEFE2] text-[#174D36]">
              {plants.length} Active Plans
            </span>
          </div>
          <p className="text-sm text-[#718078] mt-1">
            Phytopod 360 environmental telemetry, dual-probe soil moisture monitoring, growth cycles, and AI vision diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search plans or species..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-[#E2EAE4] focus:outline-none focus:ring-2 focus:ring-[#39805B] bg-[#F7FAF7]"
          />
          <button
            onClick={onOpenAddPlant}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Plant Plan</span>
          </button>
        </div>
      </div>

      {/* Grid of Dynamic Plant Plans */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlants.map((plant, idx) => {
          const readings = plant.latest_readings;
          const useRtdb = idx === 0 && hasLiveRtdbPacket && liveTelemetry;
          const temp = useRtdb ? liveTelemetry.temperature : readings?.temperature?.value;
          const hum = useRtdb ? liveTelemetry.humidity : readings?.humidity?.value;
          const soilAvg = useRtdb
            ? liveTelemetry.soil_moisture_average
            : readings?.soil_moisture_average?.value ?? readings?.soil_moisture?.value;
          const soil1 = useRtdb ? liveTelemetry.soil_moisture_1 : readings?.soil_moisture_1?.value;
          const soil2 = useRtdb ? liveTelemetry.soil_moisture_2 : readings?.soil_moisture_2?.value;
          const light = useRtdb ? liveTelemetry.light_intensity : readings?.light_intensity?.value;
          const lastTs = useRtdb ? liveTelemetry.timestamp : readings?.temperature?.device_timestamp;
          const rtdbValidation = useRtdb ? liveTelemetry.validation : undefined;
          const freshness = rtdbValidation?.has_sensor_error
            ? {
                label: 'Sensor Error',
                color: 'bg-rose-100 text-rose-800 border-rose-300',
              }
            : getFreshness(lastTs);
          const activeCycle = plant.active_cycle;

          return (
            <div
              key={plant.id}
              className="bg-white rounded-2xl border border-[#E2EAE4] shadow-sm hover:shadow-md transition flex flex-col overflow-hidden group"
            >
              {/* Card Header */}
              <div className="p-5 pb-4 border-b border-[#E2EAE4] bg-gradient-to-b from-[#F7FAF7] to-white">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#39805B]">
                      {plant.plan_name}
                    </span>
                    <h2
                      onClick={() => onSelectPlant(plant.id)}
                      className="text-base font-bold text-[#20352A] hover:text-[#174D36] cursor-pointer transition flex items-center gap-1.5 mt-0.5"
                    >
                      {plant.plant_name}
                      <ChevronRight className="w-4 h-4 text-[#718078] group-hover:translate-x-0.5 transition" />
                    </h2>
                    <p className="text-xs text-[#718078] italic">{plant.species}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${freshness.color}`}
                    title={rtdbValidation?.issues.join(' | ')}
                  >
                    {freshness.label}
                  </span>
                </div>

                {/* Active Cycle Badge */}
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-[#174D36] font-medium bg-[#DCEFE2] px-2.5 py-1 rounded-md">
                    <GitBranch className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[200px]">
                      {activeCycle ? activeCycle.cycle_name : 'Cycle 1: Baseline'}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#718078]">
                    Planted: {plant.planting_date}
                  </span>
                </div>
              </div>

              {/* Plant Image / Camera Preview Thumbnail */}
              <div
                className="relative h-40 bg-[#142B20] overflow-hidden cursor-pointer"
                onClick={() => onSelectPlant(plant.id)}
              >
                {plant.latest_image ? (
                  <img
                    src={plant.latest_image.image_data_url}
                    alt={plant.plant_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-[#DCEFE2]/70 p-4 text-center">
                    <Sprout className="w-10 h-10 text-[#39805B] mb-2" />
                    <span className="text-xs">No photograph captured yet</span>
                    <span className="text-[10px] text-[#718078] mt-0.5">Use Live Camera tab to capture</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 backdrop-blur-xs text-[10px] text-white font-mono">
                  {plant.chamber_id}
                </div>
              </div>

              {/* Environmental Sensor Telemetry Grid */}
              <div className="p-4 grid grid-cols-2 gap-2 bg-[#F7FAF7] border-b border-[#E2EAE4]">
                {/* Temperature */}
                <div className="bg-white p-2.5 rounded-xl border border-[#E2EAE4] flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600">
                    <Thermometer className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#718078] uppercase">Temp</div>
                    <div className="text-sm font-bold text-[#20352A]">
                      {useRtdb && liveTelemetry.sensor_status.temperature === 'error'
                        ? 'ERR'
                        : temp !== undefined && temp !== null
                        ? `${temp} °C`
                        : '--'}
                    </div>
                  </div>
                </div>

                {/* Humidity */}
                <div className="bg-white p-2.5 rounded-xl border border-[#E2EAE4] flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#718078] uppercase">Humidity</div>
                    <div className="text-sm font-bold text-[#20352A]">
                      {useRtdb && liveTelemetry.sensor_status.humidity === 'error'
                        ? 'ERR'
                        : hum !== undefined && hum !== null
                        ? `${hum} %`
                        : '--'}
                    </div>
                  </div>
                </div>

                {/* Soil Moisture (Dual + Avg) */}
                <div className="bg-white p-2.5 rounded-xl border border-[#E2EAE4] flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                    <Sprout className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-medium text-[#718078] uppercase">Soil Avg</div>
                    <div className="text-sm font-bold text-[#20352A]">
                      {useRtdb && liveTelemetry.sensor_status.soil_moisture_average === 'error'
                        ? 'ERR'
                        : soilAvg !== undefined && soilAvg !== null
                        ? `${soilAvg} %`
                        : '--'}
                    </div>
                    {(soil1 !== undefined && soil1 !== null) || (soil2 !== undefined && soil2 !== null) ? (
                      <div className="text-[9px] text-[#718078] font-mono truncate">
                        S1:{useRtdb && liveTelemetry.sensor_status.soil_moisture_1 === 'error' ? 'ERR' : `${soil1 ?? '--'}%`} · S2:{useRtdb && liveTelemetry.sensor_status.soil_moisture_2 === 'error' ? 'ERR' : `${soil2 ?? '--'}%`}
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Light Intensity */}
                <div className="bg-white p-2.5 rounded-xl border border-[#E2EAE4] flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#718078] uppercase">Light</div>
                    <div className="text-sm font-bold text-[#20352A]">
                      {useRtdb && liveTelemetry.sensor_status.light_intensity === 'error'
                        ? 'ERR'
                        : light !== undefined && light !== null
                        ? `${light.toLocaleString()} lx`
                        : '--'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 bg-white mt-auto flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenLiveCamera(plant.id)}
                    className="p-1.5 rounded-md hover:bg-[#DCEFE2] text-[#174D36] transition"
                    title="Open Live Camera Feed"
                  >
                    <Video className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onOpenAIDiagnosis(plant.id)}
                    className="p-1.5 rounded-md hover:bg-[#DCEFE2] text-[#174D36] transition"
                    title="Run AI Plant Health & Disease Analysis"
                  >
                    <BrainCircuit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onOpenNewCycle(plant.id)}
                    className="p-1.5 rounded-md hover:bg-[#DCEFE2] text-[#174D36] transition"
                    title="Create New Growth Cycle"
                  >
                    <GitBranch className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectPlant(plant.id)}
                    className="px-3 py-1.5 rounded-md bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold transition"
                  >
                    Open Monitor
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove plant plan "${plant.plan_name}"?`)) {
                        onDeletePlant(plant.id);
                      }
                    }}
                    className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 transition"
                    title="Delete Plant Plan"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredPlants.length === 0 && (
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-12 text-center">
          <Sprout className="w-12 h-12 text-[#39805B] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#20352A]">No plant plans found</h3>
          <p className="text-xs text-[#718078] mt-1 max-w-sm mx-auto">
            You can add as many dynamic plant experimentation plans as you wish. Each plan maintains independent telemetry, growth cycles, and camera archives.
          </p>
          <button
            onClick={onOpenAddPlant}
            className="mt-4 px-4 py-2 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
          >
            Create First Plant Plan
          </button>
        </div>
      )}
    </div>
  );
};
