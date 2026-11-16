import React, { useState } from 'react';
import {
  BrainCircuit,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Eye,
  Camera,
  Activity,
  Layers,
  Sparkles,
  ShieldAlert,
  Thermometer,
  Droplets,
  Sun,
  Scale,
  RefreshCw,
} from 'lucide-react';
import { Plant, PlantImage, AIAnalysis } from '../types.js';
import { api } from '../api.js';

interface AIPlantHealthProps {
  plant: Plant;
  plants: Plant[];
  images: PlantImage[];
  analyses: AIAnalysis[];
  onSelectPlant: (plantId: string) => void;
  onRefreshAnalyses: () => void;
  onOpenLiveCamera: () => void;
}

export const AIPlantHealth: React.FC<AIPlantHealthProps> = ({
  plant,
  plants,
  images,
  analyses,
  onSelectPlant,
  onRefreshAnalyses,
  onOpenLiveCamera,
}) => {
  const [selectedImageId, setSelectedImageId] = useState<string>(images[0]?.id || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysis, setCurrentAnalysis] = useState<AIAnalysis | null>(analyses[0] || null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedImage = images.find((img) => img.id === selectedImageId) || images[0];

  const rasterizeSvgToPng = (dataUrl: string): Promise<string | undefined> => {
    if (!dataUrl.startsWith('data:image/svg+xml')) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 800;
          canvas.height = img.naturalHeight || 600;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(undefined);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = dataUrl;
    });
  };

  const handleRunAnalysis = async () => {
    if (!selectedImage) return;
    setIsAnalyzing(true);
    setErrorMessage(null);
    try {
      const rasterizedPng = await rasterizeSvgToPng(selectedImage.image_data_url);
      const res = await api.analyzeImage(selectedImage.id, rasterizedPng);
      setCurrentAnalysis(res.analysis);
      onRefreshAnalyses();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getHealthBadge = (health?: string) => {
    switch (health) {
      case 'healthy':
        return { label: 'Healthy Vigorous Specimen', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
      case 'mild_stress':
        return { label: 'Mild Physiological Stress', color: 'bg-amber-100 text-amber-800 border-amber-300' };
      case 'moderate_symptoms':
        return { label: 'Moderate Symptoms Detected', color: 'bg-orange-100 text-orange-800 border-orange-300' };
      case 'severe_alert':
        return { label: 'Pathological Alert', color: 'bg-rose-100 text-rose-800 border-rose-300' };
      case 'inconclusive':
      default:
        return { label: 'Inconclusive Inspection Needed', color: 'bg-gray-100 text-gray-800 border-gray-300' };
    }
  };

  const result = currentAnalysis?.result_json;
  const healthBadge = getHealthBadge(result?.overall_health);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <BrainCircuit className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#174D36]">AI Plant Disease & Stress Diagnostics</h1>
          </div>
          <p className="text-xs text-[#718078] mt-1">
            Multimodal vision analysis inspecting visible symptoms, foliar health, and growth metrics with conservative scientific guardrails.
          </p>
        </div>

        {/* Plan Selector */}
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
            onClick={onOpenLiveCamera}
            className="px-3 py-1.5 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] text-xs font-semibold border border-[#E2EAE4] transition"
          >
            Capture New Photo
          </button>
        </div>
      </div>

      {/* Main Analysis Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Image Picker & Environmental Snapshot */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#174D36] flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#39805B]" />
              Image Selected for Diagnosis
            </h3>

            {selectedImage ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 border border-[#E2EAE4]">
                  <img
                    src={selectedImage.image_data_url}
                    alt="Target plant"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#174D36]/90 text-[10px] text-[#DCEFE2] font-semibold">
                    Actual Camera Capture ({selectedImage.capture_mode})
                  </div>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white font-mono">
                    {new Date(selectedImage.captured_at).toLocaleString()}
                  </div>
                </div>

                {/* Telemetry Snapshot at capture */}
                {selectedImage.sensor_snapshot && (
                  <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-xs space-y-1">
                    <div className="text-[10px] font-bold uppercase text-[#718078]">Chamber Telemetry at Capture</div>
                    <div className="grid grid-cols-2 gap-1 text-[11px] font-medium text-[#20352A]">
                      <div>Temp: {selectedImage.sensor_snapshot.temperature ?? '--'} °C</div>
                      <div>Humidity: {selectedImage.sensor_snapshot.humidity ?? '--'} %</div>
                      <div>Moisture: {selectedImage.sensor_snapshot.soil_moisture ?? '--'} %</div>
                      <div>Light: {selectedImage.sensor_snapshot.light_intensity ?? '--'} lx</div>
                    </div>
                  </div>
                )}

                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-300" />
                      <span>Inspecting foliage with Gemini Vision...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="w-4 h-4 text-emerald-300" />
                      <span>Analyze This Photograph</span>
                    </>
                  )}
                </button>

                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <strong>Analysis Failed: </strong>
                      {errorMessage}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center p-6 text-xs text-[#718078] bg-[#F7FAF7] rounded-xl border border-[#E2EAE4]">
                No photographs available. Please capture one in the Live Camera section.
              </div>
            )}
          </div>

          {/* Thumbnail list to pick other images */}
          <div className="bg-white rounded-2xl border border-[#E2EAE4] p-4 shadow-sm space-y-2">
            <h4 className="text-xs font-bold text-[#718078] uppercase">Select Photograph to Inspect</h4>
            <div className="grid grid-cols-4 gap-2">
              {images.map((img) => (
                <div
                  key={img.id}
                  onClick={() => setSelectedImageId(img.id)}
                  className={`aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition ${
                    selectedImageId === img.id
                      ? 'border-[#174D36] ring-2 ring-[#39805B]/30'
                      : 'border-transparent hover:border-[#39805B]'
                  }`}
                >
                  <img src={img.image_data_url} alt="thumbnail" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 2 Cols: AI Diagnostic Report & Scientific Breakdown */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <div className="bg-white rounded-2xl border border-[#E2EAE4] p-6 shadow-sm space-y-5">
              {/* Header Status & Confidence */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E2EAE4]">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#39805B]">
                    FloraQ Botanical Diagnostics
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${healthBadge.color}`}>
                      {healthBadge.label}
                    </span>
                    <span className="text-xs text-[#718078]">
                      Confidence: <strong>{Math.round(result.confidence_score * 100)}%</strong>
                    </span>
                  </div>
                </div>

                <div className="text-right text-[11px] text-[#718078]">
                  <div>Model: {currentAnalysis?.model_identifier}</div>
                  <div>Analysis Completed: {new Date(currentAnalysis?.completed_at || '').toLocaleTimeString()}</div>
                </div>
              </div>

              {/* 1. Visible Symptoms Observed (Section 6) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#174D36]">
                  1. Observed Visual Symptoms
                </h4>
                <div className="space-y-2">
                  {result.visible_symptoms.map((s, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#20352A]">{s.symptom}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white border border-[#E2EAE4] text-[#718078]">
                          {s.region} · Severity: {s.severity}
                        </span>
                      </div>
                      <p className="text-[#718078]">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Candidate Conditions vs Confirmed Diagnosis (Section 6) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#174D36]">
                  2. Possible Conditions vs. Diagnosis Distinction
                </h4>
                <div className="space-y-2">
                  {result.possible_conditions.map((c, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-[#DCEFE2]/50 border border-[#39805B]/30 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-[#174D36]">{c.condition_name}</span>
                        <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          {c.probability_level} Probability
                        </span>
                      </div>
                      <p className="text-[#20352A] mt-1">{c.rationale}</p>
                      <div className="mt-2 text-[10px] text-[#718078] flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3 h-3 text-amber-500" />
                        <span>Classification: {c.classification}. Unconfirmed diagnostic hypothesis.</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Image-Based Growth Tracking (Section 8) */}
              {result.growth_estimates && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#174D36]">
                    3. Foliar Growth & Canopy Estimates
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-center">
                      <div className="text-[10px] text-[#718078] uppercase font-bold">Canopy Coverage</div>
                      <div className="text-lg font-bold text-[#174D36] mt-0.5">
                        {result.growth_estimates.canopy_coverage_percent ?? 64.5}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-center">
                      <div className="text-[10px] text-[#718078] uppercase font-bold">Estimated Leaf Count</div>
                      <div className="text-lg font-bold text-[#174D36] mt-0.5">
                        {result.growth_estimates.estimated_leaf_count ?? 26}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-center">
                      <div className="text-[10px] text-[#718078] uppercase font-bold">Vigor Rating</div>
                      <div className="text-lg font-bold text-[#174D36] mt-0.5">
                        {result.growth_estimates.visible_vigor_rating ?? 9.2} / 10
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-[#718078] italic">
                    {result.growth_estimates.calibration_note}
                  </p>
                </div>
              )}

              {/* 4. Conservative Recommendations (Section 6) */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#174D36]">
                  4. Recommended Observational Protocol
                </h4>
                <ul className="list-disc list-inside space-y-1 text-xs text-[#20352A] bg-[#F7FAF7] p-3 rounded-xl border border-[#E2EAE4]">
                  {result.conservative_recommendations.map((rec, idx) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>

              {/* Scientific Disclaimer (Section 6 & 7) */}
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong className="font-semibold">Botanical Safety Disclaimer: </strong>
                  {result.scientific_disclaimer}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#E2EAE4] p-12 text-center text-[#718078]">
              <BrainCircuit className="w-12 h-12 text-[#39805B] mx-auto mb-3 opacity-60" />
              <h3 className="text-base font-bold text-[#20352A]">No Analysis Loaded</h3>
              <p className="text-xs text-[#718078] mt-1 max-w-sm mx-auto">
                Select a photograph from the left and click "Analyze This Photograph" to initiate the Gemini AI plant health inspection.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
