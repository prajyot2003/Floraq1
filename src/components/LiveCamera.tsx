import React, { useState, useEffect, useRef } from 'react';
import {
  Video,
  Camera,
  Play,
  Square,
  Maximize2,
  Minimize2,
  Clock,
  Sparkles,
  BrainCircuit,
  Trash2,
  Download,
  Calendar,
  Layers,
  Settings,
  AlertTriangle,
  RefreshCw,
  Eye,
  CheckCircle2,
  Radio,
  Sliders,
} from 'lucide-react';
import { CameraDevice, Plant, PlantImage, GrowthCycle } from '../types.js';
import { api } from '../api.js';

interface LiveCameraProps {
  plant: Plant;
  plants: Plant[];
  camera: CameraDevice | null;
  images: PlantImage[];
  cycles: GrowthCycle[];
  onSelectPlant: (plantId: string) => void;
  onRefreshImages: () => void;
  onAnalyzeImage: (imageId: string) => void;
}

export const LiveCamera: React.FC<LiveCameraProps> = ({
  plant,
  plants,
  camera,
  images,
  cycles,
  onSelectPlant,
  onRefreshImages,
  onAnalyzeImage,
}) => {
  const [streamStatus, setStreamStatus] = useState<'standby' | 'connecting' | 'live' | 'error' | 'reconnecting'>('standby');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<PlantImage | null>(images[0] || null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamMode, setStreamMode] = useState<'webrtc' | 'snapshot_refresh'>('snapshot_refresh');
  const [lastFrameTime, setLastFrameTime] = useState<string>(new Date().toLocaleTimeString());
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Scheduled settings state
  const [scheduleEnabled, setScheduleEnabled] = useState(camera?.configuration?.scheduled_enabled ?? true);
  const [scheduleInterval, setScheduleInterval] = useState(camera?.configuration?.scheduled_interval_minutes ?? 60);

  const videoContainerRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync selected image if images list updates
  useEffect(() => {
    if (!selectedImage && images.length > 0) {
      setSelectedImage(images[0]);
    }
  }, [images, selectedImage]);

  // Handle starting live video session
  const handleStartLive = async () => {
    if (!camera) return;
    setStreamStatus('connecting');
    try {
      const res = await api.startCameraSession(camera.id);
      setSessionToken(res.session_token);
      setStreamStatus('live');
      setLastFrameTime(new Date().toLocaleTimeString());

      // Start snapshot refresh poller as fallback
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = setInterval(() => {
        setLastFrameTime(new Date().toLocaleTimeString());
      }, 3000);
    } catch (err) {
      console.error('Failed to start camera session:', err);
      setStreamStatus('error');
    }
  };

  const handleStopLive = async () => {
    if (!camera) return;
    try {
      await api.stopCameraSession(camera.id);
    } catch (e) {
      // ignore
    }
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    setStreamStatus('standby');
    setSessionToken(null);
  };

  const handleCaptureImage = async () => {
    setIsCapturing(true);
    try {
      const readings = plant.latest_readings;
      const sensorSnapshot = {
        temperature: readings?.temperature?.value,
        humidity: readings?.humidity?.value,
        soil_moisture: readings?.soil_moisture_average?.value ?? readings?.soil_moisture?.value,
        soil_moisture_1: readings?.soil_moisture_1?.value,
        soil_moisture_2: readings?.soil_moisture_2?.value,
        soil_moisture_average: readings?.soil_moisture_average?.value ?? readings?.soil_moisture?.value,
        light_intensity: readings?.light_intensity?.value,
      };

      // Create new captured photo using current camera feed
      const result = await api.captureImage({
        plant_id: plant.id,
        camera_id: camera?.id || 'cam-csi-01',
        image_data_url: plant.primary_image_url || undefined,
        capture_mode: 'manual',
        sensor_snapshot: sensorSnapshot,
      });

      setSelectedImage(result.image);
      onRefreshImages();
    } catch (err) {
      alert('Capture failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setIsCapturing(false);
    }
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;
    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    if (!confirm('Are you sure you want to permanently delete this plant photograph?')) return;
    try {
      await api.deleteImage(imageId);
      if (selectedImage?.id === imageId) {
        setSelectedImage(null);
      }
      onRefreshImages();
    } catch (err) {
      alert('Delete failed: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const handleSaveSchedule = async () => {
    if (!camera) return;
    try {
      await api.updateCameraSchedule({
        camera_id: camera.id,
        scheduled_enabled: scheduleEnabled,
        scheduled_interval_minutes: scheduleInterval,
      });
      setShowScheduleModal(false);
      alert('Camera scheduled capture settings updated.');
    } catch (err) {
      alert('Failed to update schedule: ' + (err instanceof Error ? err.message : 'Error'));
    }
  };

  const filteredImages = images.filter((img) => cycleFilter === 'all' || img.cycle_id === cycleFilter);

  return (
    <div className="space-y-6">
      {/* Top Header & Plant Selector */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-[#DCEFE2] text-[#174D36]">
              <Video className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-[#174D36]">Autonomous Live Camera Telemetry</h1>
          </div>
          <p className="text-xs text-[#718078] mt-1">
            Secure WebRTC & snapshot video streaming architecture with AI vision diagnostic hook.
          </p>
        </div>

        {/* Plant Switcher Dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-[#718078]">Chamber Plan:</label>
          <select
            value={plant.id}
            onChange={(e) => onSelectPlant(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] text-[#20352A] focus:outline-none focus:ring-2 focus:ring-[#39805B]"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.plan_name} ({p.plant_name})
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F7FAF7] hover:bg-[#DCEFE2] text-[#174D36] text-xs font-semibold border border-[#E2EAE4] transition"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Capture Schedule</span>
          </button>
        </div>
      </div>

      {/* Main Video Viewport & Camera Controller */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Video Player */}
        <div className="lg:col-span-2 space-y-4">
          <div
            ref={videoContainerRef}
            className="relative bg-black rounded-2xl overflow-hidden border border-[#21593D] shadow-md aspect-video flex items-center justify-center group"
          >
            {streamStatus === 'live' ? (
              <div className="relative w-full h-full">
                {/* Fallback Refresh Snapshot Mode */}
                <img
                  src={`/api/v1/camera/stream/${camera?.id || 'cam-csi-01'}/live.jpg?t=${lastFrameTime}`}
                  alt="Live Camera Stream"
                  className="w-full h-full object-cover"
                  onError={() => setStreamStatus('error')}
                />

                {/* Overlaid Live HUD Diagnostics */}
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[11px] font-semibold text-white border border-emerald-500/40">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>LIVE STREAM ACTIVE</span>
                  </div>
                  <div className="px-2 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono text-[#DCEFE2]">
                    Snapshot Refresh Mode (3s)
                  </div>
                </div>

                <div className="absolute top-3 right-3 flex items-center gap-2">
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 rounded-md bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition"
                    title="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] text-[#DCEFE2] bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 font-mono">
                  <span>DEV: {camera?.camera_name || 'Sony IMX477 12.3MP'} ({camera?.id})</span>
                  <span>LAST FRAME: {lastFrameTime}</span>
                  <span>RES: 1920x1080 @ 24fps</span>
                </div>
              </div>
            ) : streamStatus === 'connecting' ? (
              <div className="text-center p-6 space-y-3">
                <RefreshCw className="w-8 h-8 text-[#39805B] animate-spin mx-auto" />
                <p className="text-sm font-semibold text-[#DCEFE2]">Requesting authenticated video session...</p>
                <p className="text-xs text-[#718078]">Negotiating WebRTC SDP token with Raspberry Pi 4 Gateway</p>
              </div>
            ) : streamStatus === 'error' ? (
              <div className="text-center p-6 space-y-3">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                <p className="text-sm font-semibold text-white">Camera Offline or Stream Unavailable</p>
                <p className="text-xs text-[#718078] max-w-sm">
                  The Raspberry Pi 4 camera service is currently in standby or disconnected from local Wi-Fi. Verify camera cable and gateway process.
                </p>
                <button
                  onClick={handleStartLive}
                  className="px-3 py-1.5 rounded-md bg-[#39805B] text-white text-xs font-semibold"
                >
                  Retry Connection
                </button>
              </div>
            ) : (
              <div className="text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-[#142B20] border border-[#39805B] flex items-center justify-center mx-auto text-[#DCEFE2]">
                  <Video className="w-8 h-8 text-[#39805B]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Camera In Standby Mode</h3>
                  <p className="text-xs text-[#718078] mt-1 max-w-sm mx-auto">
                    Click "Start Live View" to establish a secure, authenticated viewing stream without unnecessary continuous cloud recording.
                  </p>
                </div>
                <button
                  onClick={handleStartLive}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#39805B] hover:bg-[#43966B] text-white text-xs font-semibold shadow-md transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Live View</span>
                </button>
              </div>
            )}
          </div>

          {/* Video Stream Action Controls */}
          <div className="bg-white p-4 rounded-xl border border-[#E2EAE4] flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2">
              {streamStatus === 'live' ? (
                <button
                  onClick={handleStopLive}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop Live View</span>
                </button>
              ) : (
                <button
                  onClick={handleStartLive}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Live View</span>
                </button>
              )}

              <button
                onClick={handleCaptureImage}
                disabled={isCapturing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#39805B] hover:bg-[#43966B] text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isCapturing ? 'Capturing...' : 'Capture Image'}</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-[#718078]">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                Camera: IMX477 CSI
              </span>
              <span>·</span>
              <span>Chamber: {plant.chamber_id}</span>
            </div>
          </div>
        </div>

        {/* Right Col: Selected Photograph Inspector & Quick AI Diagnosis */}
        <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[#E2EAE4]">
            <h3 className="text-sm font-bold text-[#174D36] flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#39805B]" />
              Captured Photograph
            </h3>
            {selectedImage && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#DCEFE2] text-[#174D36]">
                {selectedImage.capture_mode.toUpperCase()}
              </span>
            )}
          </div>

          {selectedImage ? (
            <div className="space-y-3 flex-1 flex flex-col">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-4/3 border border-[#E2EAE4]">
                <img
                  src={selectedImage.image_data_url}
                  alt="Selected plant photograph"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-[#174D36]/90 text-[10px] text-[#DCEFE2] font-semibold">
                  Camera Photograph (RPi 4)
                </div>
                <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white font-mono">
                  {new Date(selectedImage.captured_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              {/* Environmental Telemetry Stamp at capture time */}
              {selectedImage.sensor_snapshot && (
                <div className="p-2.5 rounded-lg bg-[#F7FAF7] border border-[#E2EAE4] text-xs space-y-1">
                  <div className="text-[10px] font-bold uppercase text-[#718078]">Sensor Snapshot at Capture</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px] font-medium text-[#20352A]">
                    <div>Temp: {selectedImage.sensor_snapshot.temperature ?? '--'} °C</div>
                    <div>Humidity: {selectedImage.sensor_snapshot.humidity ?? '--'} %</div>
                    <div>
                      Soil Avg:{' '}
                      {selectedImage.sensor_snapshot.soil_moisture_average ??
                        selectedImage.sensor_snapshot.soil_moisture ??
                        '--'}{' '}
                      %
                    </div>
                    <div>Light: {selectedImage.sensor_snapshot.light_intensity ?? '--'} lx</div>
                  </div>
                </div>
              )}

              {/* Actions for this image */}
              <div className="space-y-2 mt-auto pt-2">
                <button
                  onClick={() => onAnalyzeImage(selectedImage.id)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold shadow-sm transition"
                >
                  <BrainCircuit className="w-4 h-4 text-emerald-300" />
                  <span>Run AI Disease Analysis</span>
                </button>

                <div className="flex items-center gap-2">
                  <a
                    href={selectedImage.image_data_url}
                    download={`floraq-${plant.plan_name}-${selectedImage.id}.jpg`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#F7FAF7] hover:bg-[#E2EAE4] text-[#20352A] text-xs font-medium border border-[#E2EAE4] transition"
                  >
                    <Download className="w-3.5 h-3.5 text-[#39805B]" />
                    <span>Download</span>
                  </a>
                  <button
                    onClick={() => handleDeleteImage(selectedImage.id)}
                    className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 border border-[#E2EAE4] transition"
                    title="Delete image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#718078]">
              <Camera className="w-10 h-10 text-[#39805B] mb-2 opacity-50" />
              <p className="text-xs font-medium text-[#20352A]">No photograph selected</p>
              <p className="text-[11px] mt-1">Capture an image from the live video feed above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Historical Plant Image Gallery Section (Section 5) */}
      <div className="bg-white rounded-2xl border border-[#E2EAE4] p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#174D36] flex items-center gap-2">
              <span>Historical Plant Image Gallery</span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-[#DCEFE2] text-[#174D36]">
                {filteredImages.length} Photographs
              </span>
            </h3>
            <p className="text-xs text-[#718078]">
              Photographs persist permanently across growth cycles in private storage.
            </p>
          </div>

          {/* Cycle Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#718078]">Cycle:</span>
            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] text-[#20352A] focus:outline-none"
            >
              <option value="all">All Growth Cycles</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cycle_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Image Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filteredImages.map((img) => {
            const isSelected = selectedImage?.id === img.id;
            return (
              <div
                key={img.id}
                onClick={() => setSelectedImage(img)}
                className={`relative rounded-xl overflow-hidden aspect-square cursor-pointer border-2 transition ${
                  isSelected ? 'border-[#174D36] ring-2 ring-[#39805B]/30' : 'border-transparent hover:border-[#39805B]'
                }`}
              >
                <img src={img.image_data_url} alt="Plant thumbnail" className="w-full h-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-white">
                  <div className="text-[10px] font-medium leading-tight truncate">
                    {new Date(img.captured_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-[9px] text-[#DCEFE2]/80 uppercase">{img.capture_mode}</div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredImages.length === 0 && (
          <div className="p-8 text-center text-xs text-[#718078] bg-[#F7FAF7] rounded-xl border border-[#E2EAE4]">
            No photographs match this cycle filter.
          </div>
        )}
      </div>

      {/* Scheduled Capture Settings Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
              <h3 className="text-base font-bold text-[#174D36]">Configure Scheduled Photography</h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-[#718078] hover:text-[#20352A]"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#718078]">
              Automated captures run autonomously on the Raspberry Pi 4 independent of whether the browser is open.
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="rounded text-[#174D36] focus:ring-[#39805B]"
                />
                <span className="text-xs font-semibold text-[#20352A]">Enable Scheduled Automatic Capture</span>
              </label>

              <div>
                <label className="text-xs font-semibold text-[#20352A] block mb-1">Capture Interval</label>
                <select
                  value={scheduleInterval}
                  onChange={(e) => setScheduleInterval(Number(e.target.value))}
                  disabled={!scheduleEnabled}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
                >
                  <option value={30}>Every 30 Minutes</option>
                  <option value={60}>Every 1 Hour (Standard)</option>
                  <option value={120}>Every 2 Hours</option>
                  <option value={360}>Every 6 Hours</option>
                  <option value={1440}>Once Per Day (Daily Timelapse)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#20352A] block mb-1">Image Resolution</label>
                <input
                  type="text"
                  readOnly
                  value="1920x1080 Full HD (Sony IMX477)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#E2EAE4] bg-gray-100 text-[#718078]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
              >
                Save Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
