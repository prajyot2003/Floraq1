import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Droplets,
  Sprout,
  Plus,
  Download,
  Calendar,
  Clock,
  FlaskConical,
  Filter,
} from 'lucide-react';
import { Plant, CareEvent, DailyObservation } from '../types.js';

interface ObservationAndCareLogsProps {
  plant: Plant;
  plants: Plant[];
  careEvents: CareEvent[];
  observations: DailyObservation[];
  onSelectPlant: (plantId: string) => void;
  onOpenObservationModal: () => void;
  onOpenCareEventModal: () => void;
  onExportCSV: () => void;
}

export const ObservationAndCareLogs: React.FC<ObservationAndCareLogsProps> = ({
  plant,
  plants,
  careEvents,
  observations,
  onSelectPlant,
  onOpenObservationModal,
  onOpenCareEventModal,
  onExportCSV,
}) => {
  const [logTab, setLogTab] = useState<'watering' | 'fertilizer' | 'observations'>('watering');

  const waterings = careEvents.filter((c) => c.event_type === 'watering');
  const fertilizers = careEvents.filter((c) => c.event_type === 'fertilizer' || c.event_type === 'treatment');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#174D36]">Care Records & Experimental Observations</h1>
          </div>
          <p className="text-xs text-[#718078] mt-1">
            Auditable records of irrigation events, fertilizer applications, and daily foliar observations with CSV telemetry export.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={plant.id}
            onChange={(e) => onSelectPlant(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] text-[#20352A] focus:outline-none"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.plan_name} ({p.plant_name})
              </option>
            ))}
          </select>
          <button
            onClick={onExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs: Watering History, Fertilizer History, Daily Observations */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#E2EAE4]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLogTab('watering')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              logTab === 'watering'
                ? 'bg-[#174D36] text-white font-semibold'
                : 'bg-[#F7FAF7] text-[#718078] hover:text-[#20352A]'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Watering History ({waterings.length})</span>
          </button>

          <button
            onClick={() => setLogTab('fertilizer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              logTab === 'fertilizer'
                ? 'bg-[#174D36] text-white font-semibold'
                : 'bg-[#F7FAF7] text-[#718078] hover:text-[#20352A]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Fertilizer & Treatments ({fertilizers.length})</span>
          </button>

          <button
            onClick={() => setLogTab('observations')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              logTab === 'observations'
                ? 'bg-[#174D36] text-white font-semibold'
                : 'bg-[#F7FAF7] text-[#718078] hover:text-[#20352A]'
            }`}
          >
            <Sprout className="w-3.5 h-3.5" />
            <span>Daily Observations ({observations.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCareEventModal}
            className="text-xs font-semibold text-[#39805B] hover:text-[#174D36] px-2 py-1"
          >
            + Record Care Event
          </button>
          <button
            onClick={onOpenObservationModal}
            className="text-xs font-semibold text-[#174D36] bg-[#DCEFE2] px-2.5 py-1 rounded-md"
          >
            + Add Observation
          </button>
        </div>
      </div>

      {/* Log Content Tables */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] overflow-hidden shadow-sm">
        {logTab === 'watering' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">Zone / Circuit</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Soil Moist (Before / After)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {waterings.map((w) => {
                  const zoneLabel = w.zone
                    ? w.zone === 'all_zones'
                      ? 'All Zones (1–4)'
                      : w.zone.toUpperCase()
                    : w.method || 'Manual';

                  const durationOrVol =
                    w.duration_seconds !== undefined && w.duration_seconds !== null
                      ? `${w.duration_seconds} s`
                      : w.quantity !== undefined && w.quantity !== null
                      ? `${w.quantity} ${w.unit || ''}`
                      : '--';

                  const beforeText =
                    w.soil_moisture_before !== undefined && w.soil_moisture_before !== null
                      ? `${w.soil_moisture_before}%`
                      : '--';
                  const afterText =
                    w.soil_moisture_after !== undefined && w.soil_moisture_after !== null
                      ? `${w.soil_moisture_after}%`
                      : '--';

                  const statusStyle =
                    w.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : w.status === 'stopped' || w.status === 'lockout_aborted'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : w.status === 'blocked_disabled'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-[#DCEFE2] text-[#174D36] border-[#39805B]/20';

                  return (
                    <tr key={w.id} className="hover:bg-[#F7FAF7]/60">
                      <td className="p-3 font-semibold whitespace-nowrap">
                        {new Date(w.event_time).toLocaleString()}
                      </td>
                      <td className="p-3 font-bold text-[#174D36]">{zoneLabel}</td>
                      <td className="p-3 font-mono font-semibold text-blue-700">{durationOrVol}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-[#F7FAF7] border border-[#E2EAE4] text-[#20352A]">
                          {w.source}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-[#20352A]">
                        {beforeText} → {afterText}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusStyle}`}>
                          {w.status || 'logged'}
                        </span>
                      </td>
                      <td className="p-3 text-[#718078] max-w-xs">{w.notes || '--'}</td>
                    </tr>
                  );
                })}
                {waterings.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[#718078]">
                      No watering events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {logTab === 'fertilizer' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-3">Application Time</th>
                  <th className="p-3">Product Name</th>
                  <th className="p-3">Quantity & Unit</th>
                  <th className="p-3">Category / Method</th>
                  <th className="p-3">Concentration</th>
                  <th className="p-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {fertilizers.map((f) => (
                  <tr key={f.id} className="hover:bg-[#F7FAF7]/60">
                    <td className="p-3 font-semibold">{new Date(f.event_time).toLocaleString()}</td>
                    <td className="p-3 font-bold text-emerald-800">{f.product_name || 'Nutrient Dosing'}</td>
                    <td className="p-3 font-semibold text-[#20352A]">
                      {f.quantity !== undefined && f.quantity !== null ? `${f.quantity} ${f.unit}` : '--'}
                    </td>
                    <td className="p-3">{f.category || f.method}</td>
                    <td className="p-3 text-[#718078] font-mono">{f.concentration || 'Standard'}</td>
                    <td className="p-3 text-[#718078] max-w-xs">{f.notes || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {logTab === 'observations' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-3">Observed Date</th>
                  <th className="p-3">Temp / RH</th>
                  <th className="p-3">Soil Moist / pH</th>
                  <th className="p-3">Height</th>
                  <th className="p-3">Foliar Observations</th>
                  <th className="p-3">Observer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {observations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-[#F7FAF7]/60">
                    <td className="p-3 font-semibold">{new Date(obs.observed_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      {obs.temperature !== null && obs.temperature !== undefined ? obs.temperature : '--'} °C /{' '}
                      {obs.humidity !== null && obs.humidity !== undefined ? obs.humidity : '--'} %
                    </td>
                    <td className="p-3">
                      {obs.soil_moisture !== null && obs.soil_moisture !== undefined ? obs.soil_moisture : '--'} % /{' '}
                      {obs.soil_ph !== null && obs.soil_ph !== undefined ? obs.soil_ph : '--'} pH
                    </td>
                    <td className="p-3 font-bold text-[#174D36]">
                      {obs.plant_height !== null && obs.plant_height !== undefined ? `${obs.plant_height} cm` : '--'}
                    </td>
                    <td className="p-3 max-w-sm">{obs.health_observations}</td>
                    <td className="p-3 text-[#718078]">{obs.created_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
