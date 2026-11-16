import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Calendar,
  Clock,
  Plus,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Droplets,
  Thermometer,
  Layers,
  ArrowRight,
  Sliders,
  Scale,
  Sparkles,
  BarChart3,
  Table as TableIcon,
  ListOrdered,
} from 'lucide-react';
import { Plant, GrowthCycle, DailyObservation, CareEvent } from '../types.js';
import { api } from '../api.js';

interface CycleManagementProps {
  plant: Plant;
  plants: Plant[];
  cycles: GrowthCycle[];
  observations: DailyObservation[];
  careEvents: CareEvent[];
  onSelectPlant: (plantId: string) => void;
  onOpenNewCycle: () => void;
  onRefreshCycles: () => void;
}

export const CycleManagement: React.FC<CycleManagementProps> = ({
  plant,
  plants,
  cycles,
  observations,
  careEvents,
  onSelectPlant,
  onOpenNewCycle,
  onRefreshCycles,
}) => {
  const [selectedCycleId, setSelectedCycleId] = useState<string>(cycles[0]?.id || '');
  const [viewMode, setViewMode] = useState<'timeline' | 'table' | 'comparison'>('timeline');
  const [comparisonData, setComparisonData] = useState<any[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);

  useEffect(() => {
    if (cycles.length > 0 && !selectedCycleId) {
      setSelectedCycleId(cycles[cycles.length - 1].id);
    }
  }, [cycles, selectedCycleId]);

  useEffect(() => {
    if (viewMode === 'comparison') {
      setLoadingComparison(true);
      api.getCycleComparison(plant.id)
        .then((res) => setComparisonData(res.comparison))
        .catch(console.error)
        .finally(() => setLoadingComparison(false));
    }
  }, [viewMode, plant.id]);

  const activeCycle = cycles.find((c) => c.id === selectedCycleId) || cycles[0];
  const cycleObservations = observations.filter((o) => o.cycle_id === selectedCycleId);
  const cycleCares = careEvents.filter((c) => c.cycle_id === selectedCycleId);

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <GitBranch className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#174D36]">Growth Cycle & Experiment Lifecycle</h1>
          </div>
          <p className="text-xs text-[#718078] mt-1">
            Complete versioned history of experimental setpoints, daily observations, and multi-cycle comparisons.
          </p>
        </div>

        {/* Plant Selector & New Cycle Trigger */}
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
            onClick={onOpenNewCycle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create New Cycle</span>
          </button>
        </div>
      </div>

      {/* Cycle Selector Bar & View Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E2EAE4]">
        {/* Cycle Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {cycles.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCycleId(c.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                selectedCycleId === c.id
                  ? 'bg-[#174D36] text-white font-semibold shadow-xs'
                  : 'bg-[#F7FAF7] text-[#718078] hover:text-[#20352A] border border-[#E2EAE4]'
              }`}
            >
              <span>{c.cycle_name}</span>
              <span
                className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-bold ${
                  c.status === 'active'
                    ? 'bg-emerald-400 text-black'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {c.status}
              </span>
            </button>
          ))}
        </div>

        {/* View Switcher: Timeline, Table, Comparison */}
        <div className="flex items-center gap-1 bg-[#F7FAF7] p-1 rounded-lg border border-[#E2EAE4] self-end sm:self-auto">
          <button
            onClick={() => setViewMode('timeline')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              viewMode === 'timeline'
                ? 'bg-white text-[#174D36] shadow-xs font-semibold'
                : 'text-[#718078]'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Timeline</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              viewMode === 'table'
                ? 'bg-white text-[#174D36] shadow-xs font-semibold'
                : 'text-[#718078]'
            }`}
          >
            <TableIcon className="w-3.5 h-3.5" />
            <span>Table View</span>
          </button>
          <button
            onClick={() => setViewMode('comparison')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition ${
              viewMode === 'comparison'
                ? 'bg-white text-[#174D36] shadow-xs font-semibold'
                : 'text-[#718078]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Cycle Comparison</span>
          </button>
        </div>
      </div>

      {/* Cycle Detail Summary Banner */}
      {activeCycle && viewMode !== 'comparison' && (
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#20352A]">{activeCycle.cycle_name}</h2>
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold rounded bg-[#DCEFE2] text-[#174D36]">
                  {activeCycle.status}
                </span>
              </div>
              <p className="text-xs text-[#718078] mt-0.5">
                Started: {new Date(activeCycle.start_at).toLocaleDateString()}
                {activeCycle.end_at ? ` · Completed: ${new Date(activeCycle.end_at).toLocaleDateString()}` : ' · Ongoing'}
              </p>
            </div>

            {/* Target Changes Audit Callout */}
            {activeCycle.cycle_number > 1 && (
              <div className="p-2.5 rounded-lg bg-[#DCEFE2]/70 border border-[#39805B]/30 text-xs text-[#174D36]">
                <span className="font-bold">Target Parameter Audit: </span>
                <span>Daytime Thermal setpoint elevated to 27.0°C (+3.0°C over Cycle 1 baseline). Target Humidity set to 72% (+7%).</span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-xs">
            <strong className="text-[#174D36]">Objective & Experimental Hypothesis: </strong>
            <span className="text-[#20352A]">{activeCycle.objective || 'Baseline climatic characterization.'}</span>
          </div>
        </div>
      )}

      {/* VIEW 1: Chronological Daily Timeline (Section 6) */}
      {viewMode === 'timeline' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[#174D36]">Chronological Daily Timeline</h3>

          <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#DCEFE2]">
            {cycleObservations.map((obs, idx) => (
              <div key={obs.id} className="relative bg-white rounded-xl border border-[#E2EAE4] p-4 shadow-sm">
                {/* Timeline node circle */}
                <div className="absolute -left-6 top-4 w-3.5 h-3.5 rounded-full bg-[#39805B] border-2 border-white shadow-xs"></div>

                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-[#E2EAE4]">
                  <div>
                    <span className="text-xs font-bold text-[#174D36]">
                      Day {idx + 1} — {new Date(obs.observed_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-[11px] text-[#718078] ml-2">Observed by {obs.created_by}</span>
                  </div>
                  <span className="text-[10px] text-[#718078] font-mono">
                    {new Date(obs.observed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Day's measurements pill grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 text-xs mb-3">
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Temp</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.temperature !== null && obs.temperature !== undefined ? `${obs.temperature} °C` : '--'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Humidity</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.humidity !== null && obs.humidity !== undefined ? `${obs.humidity} %` : '--'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Soil Moist</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.soil_moisture !== null && obs.soil_moisture !== undefined ? `${obs.soil_moisture} %` : '--'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Light</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.light_intensity !== null && obs.light_intensity !== undefined ? `${obs.light_intensity} lx` : '--'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Soil pH</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.soil_ph !== null && obs.soil_ph !== undefined ? `${obs.soil_ph} pH` : '--'}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                    <div className="text-[10px] text-[#718078] uppercase">Height</div>
                    <div className="font-bold text-[#20352A]">
                      {obs.plant_height !== null && obs.plant_height !== undefined ? `${obs.plant_height} cm` : '--'}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-[#20352A] space-y-1">
                  <div>
                    <strong className="text-[#174D36]">Foliar Observations:</strong> {obs.health_observations}
                  </div>
                  {obs.notes && (
                    <div className="text-[#718078] italic">
                      <strong>Notes:</strong> {obs.notes}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {cycleObservations.length === 0 && (
              <div className="bg-white p-8 rounded-xl border border-[#E2EAE4] text-center text-xs text-[#718078]">
                No manual observations recorded yet for this growth cycle.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: Table View */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-2xl border border-[#E2EAE4] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[#E2EAE4] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#174D36]">Cycle Telemetry & Observation Records</h3>
            <span className="text-xs text-[#718078]">{cycleObservations.length} daily entries</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7FAF7] text-[#718078] uppercase font-bold border-b border-[#E2EAE4]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Temp (°C)</th>
                  <th className="p-3">Humidity (%)</th>
                  <th className="p-3">Moisture (%)</th>
                  <th className="p-3">Light (lux)</th>
                  <th className="p-3">pH</th>
                  <th className="p-3">Height (cm)</th>
                  <th className="p-3">Observations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2EAE4] text-[#20352A]">
                {cycleObservations.map((obs) => (
                  <tr key={obs.id} className="hover:bg-[#F7FAF7]/60">
                    <td className="p-3 font-semibold">{new Date(obs.observed_at).toLocaleDateString()}</td>
                    <td className="p-3">{obs.temperature ?? '--'}</td>
                    <td className="p-3">{obs.humidity ?? '--'}</td>
                    <td className="p-3">{obs.soil_moisture ?? '--'}</td>
                    <td className="p-3">{obs.light_intensity ?? '--'}</td>
                    <td className="p-3">{obs.soil_ph ?? '--'}</td>
                    <td className="p-3 font-medium text-[#174D36]">{obs.plant_height ?? '--'}</td>
                    <td className="p-3 max-w-xs truncate">{obs.health_observations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: Cycle Comparison Matrix (Section 11) */}
      {viewMode === 'comparison' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-[#174D36]">Cross-Cycle Comparative Analysis</h3>
            <p className="text-xs text-[#718078]">
              Comparison of environmental setpoints, consumption, and growth outcomes between Cycle 1 (Baseline) and Cycle 2 (Elevated VPD).
            </p>
          </div>

          {loadingComparison ? (
            <div className="p-8 text-center text-xs text-[#718078] bg-white rounded-2xl border border-[#E2EAE4]">
              Calculating statistical comparisons across cycles...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {comparisonData.map((item, idx) => {
                const c = item.cycle as GrowthCycle;
                const stats = item.stats;
                return (
                  <div
                    key={c.id}
                    className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-[#E2EAE4]">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#39805B]">
                          Cycle {c.cycle_number}
                        </span>
                        <h4 className="text-sm font-bold text-[#20352A]">{c.cycle_name}</h4>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-[#DCEFE2] text-[#174D36]">
                        {c.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                        <span className="text-[10px] text-[#718078] uppercase font-bold">Avg Temperature</span>
                        <div className="text-sm font-bold text-[#20352A] mt-0.5">
                          {stats.temperature?.avg ?? '--'} °C
                        </div>
                        <span className="text-[9px] text-[#718078]">
                          Min: {stats.temperature?.min}° / Max: {stats.temperature?.max}°
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                        <span className="text-[10px] text-[#718078] uppercase font-bold">Avg Humidity</span>
                        <div className="text-sm font-bold text-[#20352A] mt-0.5">
                          {stats.humidity?.avg ?? '--'} %
                        </div>
                        <span className="text-[9px] text-[#718078]">
                          Min: {stats.humidity?.min}% / Max: {stats.humidity?.max}%
                        </span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                        <span className="text-[10px] text-[#718078] uppercase font-bold">Total Water Supplied</span>
                        <div className="text-sm font-bold text-blue-600 mt-0.5">
                          {stats.total_water_liters} Litres
                        </div>
                        <span className="text-[9px] text-[#718078]">Precision drip manifold</span>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4]">
                        <span className="text-[10px] text-[#718078] uppercase font-bold">Fertilizer Events</span>
                        <div className="text-sm font-bold text-emerald-700 mt-0.5">
                          {stats.fertilizer_events} Applications
                        </div>
                        <span className="text-[9px] text-[#718078]">Sub-canopy fertigation</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-xs">
                      <div className="text-[10px] font-bold uppercase text-[#718078]">Data Completeness</div>
                      <div className="text-[11px] text-[#20352A] mt-0.5">
                        {stats.reading_samples} continuous telemetry samples logged · {stats.observation_count} manual observations
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
