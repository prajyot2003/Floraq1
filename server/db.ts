import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface UserProfile {
  id: string;
  phone_number: string;
  password_hash: string;
  full_name: string;
  role: 'owner' | 'researcher' | 'operator';
  created_at: string;
  updated_at: string;
}

export interface Chamber {
  id: string;
  name: string;
  location: string;
  status: 'online' | 'offline' | 'maintenance';
  configuration: Record<string, unknown>;
  created_at: string;
}

export interface Plant {
  id: string;
  owner_id: string;
  plan_name: string;
  display_number: number;
  plant_name: string;
  species: string;
  chamber_id: string;
  planting_date: string;
  status: 'active' | 'completed' | 'archived';
  notes: string;
  primary_image_url?: string;
  created_at: string;
  updated_at: string;
}

export interface GrowthCycle {
  id: string;
  plant_id: string;
  cycle_number: number;
  cycle_name: string;
  objective: string;
  start_at: string;
  end_at?: string | null;
  status: 'planned' | 'active' | 'paused' | 'completed';
  initial_targets?: Record<string, number>;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface EnvironmentalTarget {
  id: string;
  plant_id: string;
  cycle_id: string;
  parameter_name: string;
  target_value: number;
  unit: string;
  tolerance_min?: number;
  tolerance_max?: number;
  effective_start: string;
  effective_end?: string | null;
  configured_by: string;
  created_at: string;
}

export interface SensorReading {
  id: string;
  plant_id: string;
  cycle_id: string | null;
  chamber_id: string;
  device_id: string;
  gateway_id: string;
  event_id: string;
  parameter_name: 'temperature' | 'humidity' | 'soil_moisture' | 'light_intensity' | 'soil_ph' | 'plant_height' | string;
  value: number;
  unit: string;
  device_timestamp: string;
  received_at: string;
  data_source: 'hardware_gateway' | 'manual_entry' | 'simulator_test' | 'firebase_rtdb' | 'usb_serial';
  quality_status: 'valid' | 'out_of_range' | 'calibrating' | 'stale' | 'error';
}

export interface DailyObservation {
  id: string;
  plant_id: string;
  cycle_id: string;
  observed_at: string;
  temperature?: number | null;
  humidity?: number | null;
  soil_moisture?: number | null;
  light_intensity?: number | null;
  soil_ph?: number | null;
  plant_height?: number | null;
  health_observations: string;
  image_url?: string;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface CareEvent {
  id: string;
  plant_id: string;
  cycle_id: string;
  event_type: 'watering' | 'fertilizer' | 'training' | 'pruning' | 'treatment';
  event_time: string;
  quantity?: number;
  unit?: string;
  method?: string;
  product_name?: string;
  category?: string;
  concentration?: string;
  notes: string;
  source: 'manual' | 'automated' | 'firebase_rtdb' | 'esp32_zone_control';
  zone?: string;
  duration_seconds?: number;
  soil_moisture_before?: number | null;
  soil_moisture_after?: number | null;
  status?: 'completed' | 'blocked_disabled' | 'lockout_aborted' | 'stopped' | 'logged' | 'command_sent';
  created_at: string;
}

export interface GatewayDevice {
  id: string;
  chamber_id: string;
  gateway_name: string;
  api_key_hash: string;
  plain_api_key_preview?: string;
  status: 'connected' | 'offline' | 'syncing' | 'stale';
  last_seen_at: string;
  last_ingestion_at?: string;
  ip_address?: string;
  firmware_version?: string;
  queued_count?: number;
  last_error?: string | null;
  created_at: string;
}

export interface CameraDevice {
  id: string;
  chamber_id: string;
  camera_name: string;
  camera_type: 'csi_imx219' | 'csi_imx477' | 'usb_webcam' | 'virtual_stream';
  device_identifier: string;
  status: 'online' | 'streaming' | 'standby' | 'offline';
  last_seen_at: string;
  last_frame_at?: string;
  configuration: {
    resolution: string;
    framerate: number;
    rotation: number;
    scheduled_interval_minutes: number;
    scheduled_enabled: boolean;
    stream_port?: number;
  };
  created_at: string;
}

export interface PlantImage {
  id: string;
  owner_id: string;
  plant_id: string;
  cycle_id?: string | null;
  camera_id?: string;
  storage_key: string;
  image_data_url: string; // Base64 data URL for private storage representation
  captured_at: string;
  uploaded_at: string;
  capture_mode: 'manual' | 'scheduled' | 'ai_trigger';
  quality_status: 'optimal' | 'low_light' | 'overexposed' | 'blurry' | 'unverified';
  dimensions?: { width: number; height: number };
  sensor_snapshot?: {
    temperature?: number;
    humidity?: number;
    soil_moisture?: number;
    soil_moisture_1?: number;
    soil_moisture_2?: number;
    soil_moisture_average?: number;
    light_intensity?: number;
  };
}

export interface AIAnalysis {
  id: string;
  owner_id: string;
  image_id: string;
  plant_id: string;
  cycle_id?: string | null;
  analysis_type: 'disease_and_stress' | 'growth_metrics';
  model_identifier: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result_json?: {
    overall_health: 'healthy' | 'mild_stress' | 'moderate_symptoms' | 'severe_alert' | 'inconclusive';
    confidence_score: number;
    image_quality_check: {
      suitable_for_diagnosis: boolean;
      issues_detected?: string[];
    };
    visible_symptoms: Array<{
      symptom: string;
      region: string;
      severity: 'mild' | 'moderate' | 'severe';
      description: string;
    }>;
    possible_conditions: Array<{
      condition_name: string;
      classification: 'visible_symptom' | 'possible_disease' | 'environmental_stress';
      probability_level: 'low' | 'moderate' | 'high';
      rationale: string;
      is_confirmed_diagnosis: false; // Explicit disclaimer field
    }>;
    growth_estimates?: {
      canopy_coverage_percent?: number;
      estimated_leaf_count?: number;
      visible_vigor_rating?: number;
      calibration_note: string;
    };
    conservative_recommendations: string[];
    suggested_follow_up: string;
    scientific_disclaimer: string;
  };
  error_summary?: string;
  created_at: string;
  completed_at?: string;
}

export interface GeneratedVisualization {
  id: string;
  owner_id: string;
  plant_id: string;
  cycle_id?: string | null;
  source_image_id?: string;
  storage_key: string;
  image_data_url: string;
  prompt_description: string;
  model_identifier: string;
  created_at: string;
  visualization_label: string; // Strictly stamped 'AI-generated visualization'
}

export interface GatewaySyncLog {
  id: string;
  gateway_id: string;
  sync_started_at: string;
  sync_completed_at: string;
  uploaded_count: number;
  failed_count: number;
  status: 'success' | 'partial' | 'failed';
  error_summary?: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  created_at: string;
}

interface DatabaseState {
  profiles: UserProfile[];
  chambers: Chamber[];
  plants: Plant[];
  growth_cycles: GrowthCycle[];
  environmental_targets: EnvironmentalTarget[];
  sensor_readings: SensorReading[];
  daily_observations: DailyObservation[];
  care_events: CareEvent[];
  gateway_devices: GatewayDevice[];
  cameras: CameraDevice[];
  plant_images: PlantImage[];
  ai_analyses: AIAnalysis[];
  generated_visualizations: GeneratedVisualization[];
  gateway_sync_logs: GatewaySyncLog[];
  audit_logs: AuditLog[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'floraq.db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class FloraQDatabase {
  private state: DatabaseState;

  constructor() {
    this.state = this.loadState();
    if (this.state.profiles.length === 0) {
      this.seedInitialData();
    } else {
      this.migrateLegacyHardwareState();
    }
  }

  private migrateLegacyHardwareState() {
    let changed = false;
    const nowMs = Date.now();

    for (const gw of this.state.gateway_devices) {
      if (gw.id === 'rpi4-gw-001' && gw.firmware_version !== 'v2.0.0-phytopod360-usb') {
        gw.gateway_name = 'Phytopod 360 Raspberry Pi 4 Bridge';
        gw.firmware_version = 'v2.0.0-phytopod360-usb';
        changed = true;
      }
      const lastTs = gw.last_ingestion_at || gw.last_seen_at;
      const lastMs = lastTs ? new Date(lastTs).getTime() : 0;
      if (gw.status === 'connected' && (!Number.isFinite(lastMs) || nowMs - lastMs > 120_000)) {
        gw.status = 'offline';
        changed = true;
      }
    }

    for (const cam of this.state.cameras) {
      const lastFrameMs = cam.last_frame_at ? new Date(cam.last_frame_at).getTime() : 0;
      if (
        (cam.status === 'online' || cam.status === 'streaming') &&
        (!Number.isFinite(lastFrameMs) || nowMs - lastFrameMs > 120_000)
      ) {
        cam.status = 'standby';
        changed = true;
      }
    }

    if (changed) {
      this.saveState();
    }
  }

  private loadState(): DatabaseState {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.error('[FloraQ DB] Error reading DB file, initializing fresh:', err);
      }
    }
    return {
      profiles: [],
      chambers: [],
      plants: [],
      growth_cycles: [],
      environmental_targets: [],
      sensor_readings: [],
      daily_observations: [],
      care_events: [],
      gateway_devices: [],
      cameras: [],
      plant_images: [],
      ai_analyses: [],
      generated_visualizations: [],
      gateway_sync_logs: [],
      audit_logs: [],
    };
  }

  private saveState() {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('[FloraQ DB] Failed to save state to disk:', err);
    }
  }

  private seedInitialData() {
    console.log('[FloraQ DB] Seeding initial demonstration chamber and baseline setup...');
    const now = new Date();
    const demoUserId = 'user-owner-001';
    const demoPasswordHash = crypto.createHash('sha256').update('floraq2026').digest('hex');

    const defaultProfile: UserProfile = {
      id: demoUserId,
      phone_number: '+1 (555) 234-5678',
      password_hash: demoPasswordHash,
      full_name: 'Dr. Evelyn Vance (Botanical Systems)',
      role: 'owner',
      created_at: new Date(now.getTime() - 86400000 * 30).toISOString(),
      updated_at: new Date(now.getTime() - 86400000 * 30).toISOString(),
    };

    const chamber1: Chamber = {
      id: 'chamber-alpha-01',
      name: 'Chamber Alpha-01 (Environmental Climatic Cell)',
      location: 'FloraQ Lab Bay A-3',
      status: 'online',
      configuration: {
        lighting_dimmer: 'PWM_400nm_730nm',
        aeration: 'positive_pressure_hepa',
        irrigation_type: 'precision_drip_manifold',
      },
      created_at: new Date(now.getTime() - 86400000 * 30).toISOString(),
    };

    const rpiGateway: GatewayDevice = {
      id: 'rpi4-gw-001',
      chamber_id: 'chamber-alpha-01',
      gateway_name: 'Raspberry Pi 4 Model B (Phytopod AI & Camera Host)',
      api_key_hash: crypto.createHash('sha256').update('floraq_gw_secret_alpha_8829').digest('hex'),
      plain_api_key_preview: 'floraq_gw_secret_alpha_8829',
      status: 'offline',
      last_seen_at: new Date(now.getTime() - 86400000).toISOString(),
      last_ingestion_at: undefined,
      ip_address: '192.168.1.140',
      firmware_version: 'phytopod-rpi-v3.0',
      queued_count: 0,
      last_error: null,
      created_at: new Date(now.getTime() - 86400000 * 30).toISOString(),
    };

    const camera1: CameraDevice = {
      id: 'cam-csi-01',
      chamber_id: 'chamber-alpha-01',
      camera_name: 'RPi HQ Camera (Sony IMX477 12.3MP)',
      camera_type: 'csi_imx477',
      device_identifier: '/dev/video0',
      status: 'standby',
      last_seen_at: new Date(now.getTime() - 86400000).toISOString(),
      last_frame_at: undefined,
      configuration: {
        resolution: '1920x1080',
        framerate: 24,
        rotation: 0,
        scheduled_interval_minutes: 60,
        scheduled_enabled: true,
        stream_port: 8554,
      },
      created_at: new Date(now.getTime() - 86400000 * 30).toISOString(),
    };

    // Dynamic Plants: Plan 1 (Rose), Plan 2 (Cherry Tomato), Plan 3 (Zinnia)
    const plant1: Plant = {
      id: 'plant-rose-01',
      owner_id: demoUserId,
      plan_name: 'Plan 1 — Rose',
      display_number: 1,
      plant_name: 'Rosa grandiflora (Queen Elizabeth)',
      species: 'Rosa hybrid grandiflora',
      chamber_id: 'chamber-alpha-01',
      planting_date: new Date(now.getTime() - 86400000 * 21).toISOString().slice(0, 10),
      status: 'active',
      notes: 'Autonomous training experiment evaluating stem elongation and node spacing under manipulated humidity regimes.',
      created_at: new Date(now.getTime() - 86400000 * 21).toISOString(),
      updated_at: now.toISOString(),
    };

    const plant2: Plant = {
      id: 'plant-tomato-02',
      owner_id: demoUserId,
      plan_name: 'Plan 2 — Cherry Tomato',
      display_number: 2,
      plant_name: 'Solanum lycopersicum (Sweet 100)',
      species: 'Solanum lycopersicum var. cerasiforme',
      chamber_id: 'chamber-alpha-01',
      planting_date: new Date(now.getTime() - 86400000 * 14).toISOString().slice(0, 10),
      status: 'active',
      notes: 'Evaluating fruit set development and vegetative pruning response with precision nutrient dosing.',
      created_at: new Date(now.getTime() - 86400000 * 14).toISOString(),
      updated_at: now.toISOString(),
    };

    const plant3: Plant = {
      id: 'plant-zinnia-03',
      owner_id: demoUserId,
      plan_name: 'Plan 3 — Zinnia',
      display_number: 3,
      plant_name: 'Zinnia elegans (Benary Giant)',
      species: 'Zinnia elegans',
      chamber_id: 'chamber-alpha-01',
      planting_date: new Date(now.getTime() - 86400000 * 7).toISOString().slice(0, 10),
      status: 'active',
      notes: 'Baseline photometric canopy coverage study.',
      created_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      updated_at: now.toISOString(),
    };

    // Plant 1 has multiple growth cycles preserving history
    const cycle1Plant1: GrowthCycle = {
      id: 'cycle-rose-c1',
      plant_id: 'plant-rose-01',
      cycle_number: 1,
      cycle_name: 'Cycle 1: Baseline Climatic Conditions',
      objective: 'Establish baseline growth rates, stomatal response, and internode length under ambient 24°C / 65% RH baseline.',
      start_at: new Date(now.getTime() - 86400000 * 21).toISOString(),
      end_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      status: 'completed',
      initial_targets: { temperature: 24, humidity: 65, soil_moisture: 45, light_intensity: 9500 },
      notes: 'Completed successfully without fungal infections. Average internode length 3.4 cm.',
      created_at: new Date(now.getTime() - 86400000 * 21).toISOString(),
      updated_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
    };

    const cycle2Plant1: GrowthCycle = {
      id: 'cycle-rose-c2',
      plant_id: 'plant-rose-01',
      cycle_number: 2,
      cycle_name: 'Cycle 2: Elevated VPD & Thermal Optimization',
      objective: 'Elevate daytime thermal setpoint to 27°C with increased photoperiod to observe flowering bud induction speed.',
      start_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      end_at: null,
      status: 'active',
      initial_targets: { temperature: 27, humidity: 72, soil_moisture: 50, light_intensity: 12000 },
      notes: 'Active phase. Target temperature increased by +3°C over Cycle 1 baseline.',
      created_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      updated_at: now.toISOString(),
    };

    const cycle1Tomato: GrowthCycle = {
      id: 'cycle-tomato-c1',
      plant_id: 'plant-tomato-02',
      cycle_number: 1,
      cycle_name: 'Cycle 1: Vegetative Canopy Ramp',
      objective: 'Optimized nitrogen-potassium regime with target 25°C daytime.',
      start_at: new Date(now.getTime() - 86400000 * 14).toISOString(),
      end_at: null,
      status: 'active',
      initial_targets: { temperature: 25, humidity: 68, soil_moisture: 55, light_intensity: 11000 },
      notes: 'Strong apical dominance observed.',
      created_at: new Date(now.getTime() - 86400000 * 14).toISOString(),
      updated_at: now.toISOString(),
    };

    const cycle1Zinnia: GrowthCycle = {
      id: 'cycle-zinnia-c1',
      plant_id: 'plant-zinnia-03',
      cycle_number: 1,
      cycle_name: 'Cycle 1: Germination & Early Foliar Emergence',
      objective: 'High humidity dome transition to open chamber.',
      start_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      end_at: null,
      status: 'active',
      initial_targets: { temperature: 23, humidity: 75, soil_moisture: 60, light_intensity: 8000 },
      notes: 'All 8 seed cells germinated.',
      created_at: new Date(now.getTime() - 86400000 * 7).toISOString(),
      updated_at: now.toISOString(),
    };

    // Environmental targets
    const targets: EnvironmentalTarget[] = [
      {
        id: 'tgt-rose-c2-temp',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        parameter_name: 'temperature',
        target_value: 27.0,
        unit: '°C',
        tolerance_min: 25.5,
        tolerance_max: 28.5,
        effective_start: cycle2Plant1.start_at,
        configured_by: 'Dr. Evelyn Vance',
        created_at: cycle2Plant1.start_at,
      },
      {
        id: 'tgt-rose-c2-hum',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        parameter_name: 'humidity',
        target_value: 72.0,
        unit: '%',
        tolerance_min: 65.0,
        tolerance_max: 78.0,
        effective_start: cycle2Plant1.start_at,
        configured_by: 'Dr. Evelyn Vance',
        created_at: cycle2Plant1.start_at,
      },
      {
        id: 'tgt-rose-c2-soil',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        parameter_name: 'soil_moisture',
        target_value: 50.0,
        unit: '%',
        tolerance_min: 40.0,
        tolerance_max: 60.0,
        effective_start: cycle2Plant1.start_at,
        configured_by: 'Dr. Evelyn Vance',
        created_at: cycle2Plant1.start_at,
      },
      {
        id: 'tgt-rose-c2-light',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        parameter_name: 'light_intensity',
        target_value: 12000,
        unit: 'lux',
        tolerance_min: 10000,
        tolerance_max: 14000,
        effective_start: cycle2Plant1.start_at,
        configured_by: 'Dr. Evelyn Vance',
        created_at: cycle2Plant1.start_at,
      },
    ];

    // Seed realistic sensor readings for Plant 1 across recent hours
    const readings: SensorReading[] = [];
    for (let i = 48; i >= 0; i--) {
      const ts = new Date(now.getTime() - i * 3600000);
      const isDay = ts.getHours() >= 6 && ts.getHours() <= 20;
      const baseTemp = isDay ? 26.8 : 22.2;
      const tempFluct = Math.sin(i / 4) * 0.9 + (i % 2 === 0 ? 0.2 : -0.2);
      const baseHum = isDay ? 71.5 : 77.0;
      const humFluct = Math.cos(i / 3) * 1.8;
      const soilMoist1 = Math.max(36, 51 - (i % 18) * 0.7);
      const soilMoist2 = Math.max(39, 53 - (i % 16) * 0.65);
      const soilMoistAvg = parseFloat(((soilMoist1 + soilMoist2) / 2).toFixed(1));
      const lightLux = isDay ? Math.round(11800 + Math.sin(i / 2) * 800) : 0;

      readings.push({
        id: `reading-rose-${i}-temp`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-temp-${i}-${ts.getTime()}`,
        parameter_name: 'temperature',
        value: parseFloat((baseTemp + tempFluct).toFixed(1)),
        unit: '°C',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-hum`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-hum-${i}-${ts.getTime()}`,
        parameter_name: 'humidity',
        value: parseFloat((baseHum + humFluct).toFixed(1)),
        unit: '%',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-soil1`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-soil1-${i}-${ts.getTime()}`,
        parameter_name: 'soil_moisture_1',
        value: parseFloat(soilMoist1.toFixed(1)),
        unit: '%',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-soil2`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-soil2-${i}-${ts.getTime()}`,
        parameter_name: 'soil_moisture_2',
        value: parseFloat(soilMoist2.toFixed(1)),
        unit: '%',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-soil-avg`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-soil-avg-${i}-${ts.getTime()}`,
        parameter_name: 'soil_moisture_average',
        value: soilMoistAvg,
        unit: '%',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-soil`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-soil-${i}-${ts.getTime()}`,
        parameter_name: 'soil_moisture',
        value: soilMoistAvg,
        unit: '%',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });

      readings.push({
        id: `reading-rose-${i}-light`,
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        chamber_id: 'chamber-alpha-01',
        device_id: 'esp32-phytopod-01',
        gateway_id: 'rpi4-gw-001',
        event_id: `evt-light-${i}-${ts.getTime()}`,
        parameter_name: 'light_intensity',
        value: lightLux,
        unit: 'lux',
        device_timestamp: ts.toISOString(),
        received_at: new Date(ts.getTime() + 120).toISOString(),
        data_source: 'hardware_gateway',
        quality_status: 'valid',
      });
    }

    // Care events
    const careEvents: CareEvent[] = [
      {
        id: 'care-rose-01',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        event_type: 'watering',
        event_time: new Date(now.getTime() - 86400000 * 1.5).toISOString(),
        method: 'Zone 1 Relay (Motor 1 + Solenoid Valve 1)',
        zone: 'zone1',
        duration_seconds: 15,
        soil_moisture_before: 42.0,
        soil_moisture_after: 49.4,
        status: 'completed',
        notes: 'Logged baseline watering run via Zone 1 before WATERING_ENABLED safety lock.',
        source: 'manual',
        created_at: new Date(now.getTime() - 86400000 * 1.5).toISOString(),
      },
      {
        id: 'care-rose-02',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        event_type: 'fertilizer',
        event_time: new Date(now.getTime() - 86400000 * 3).toISOString(),
        quantity: 250,
        unit: 'mL',
        method: 'Sub-canopy fertigation',
        product_name: 'FloraNova Bloom Pro (4-8-7)',
        category: 'Balanced Floral Nutrient',
        concentration: '1.8 mS/cm EC',
        notes: 'Dosed during morning photoperiod start.',
        source: 'manual',
        created_at: new Date(now.getTime() - 86400000 * 3).toISOString(),
      },
      {
        id: 'care-rose-03',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        event_type: 'training',
        event_time: new Date(now.getTime() - 86400000 * 4).toISOString(),
        method: 'Low Stress Training (LST) Gentle Trellis Pegging',
        notes: 'Gently angled primary apical stem 30 degrees outward to maximize PAR light penetration to lower nodes.',
        source: 'manual',
        created_at: new Date(now.getTime() - 86400000 * 4).toISOString(),
      },
    ];

    // Daily Observations
    const dailyObservations: DailyObservation[] = [
      {
        id: 'obs-rose-day-1',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        observed_at: new Date(now.getTime() - 86400000 * 5).toISOString(),
        temperature: 26.7,
        humidity: 71.2,
        soil_moisture: 48.5,
        light_intensity: 12100,
        soil_ph: 6.4,
        plant_height: 38.5,
        health_observations: 'Vigorous leaf turgor. No visible chlorosis or necrotic margins. New lateral shoots emerging at node 4.',
        notes: 'Growth rate averaging +0.8 cm/day under Cycle 2 thermal regime.',
        created_by: 'Dr. Evelyn Vance',
        created_at: new Date(now.getTime() - 86400000 * 5).toISOString(),
      },
      {
        id: 'obs-rose-day-2',
        plant_id: 'plant-rose-01',
        cycle_id: 'cycle-rose-c2',
        observed_at: new Date(now.getTime() - 86400000 * 2).toISOString(),
        temperature: 27.1,
        humidity: 72.8,
        soil_moisture: 45.2,
        light_intensity: 11950,
        soil_ph: 6.5,
        plant_height: 40.2,
        health_observations: 'Terminal flower bud has swollen to 14mm diameter. Healthy deep green petioles with strong lignification.',
        notes: 'Manual caliper measurement of stem diameter: 6.2mm.',
        created_by: 'Dr. Evelyn Vance',
        created_at: new Date(now.getTime() - 86400000 * 2).toISOString(),
      },
    ];

    // Seed realistic sample captured images for Plant 1
    // High-resolution clean botanical SVG data URLs for instant crisp preview
    const sampleRoseImgData = `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
        <defs>
          <radialGradient id="bg" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stop-color="#142B20"/>
            <stop offset="100%" stop-color="#08140D"/>
          </radialGradient>
          <linearGradient id="stem" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#39805B"/>
            <stop offset="100%" stop-color="#1E4D36"/>
          </linearGradient>
          <linearGradient id="leaf" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4E9E70"/>
            <stop offset="100%" stop-color="#21593D"/>
          </linearGradient>
          <radialGradient id="petal" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stop-color="#FF5A78"/>
            <stop offset="60%" stop-color="#D9284D"/>
            <stop offset="100%" stop-color="#8C0D26"/>
          </radialGradient>
        </defs>
        <rect width="800" height="600" fill="url(#bg)"/>
        <!-- Chamber measurement grid overlay -->
        <line x1="100" y1="50" x2="100" y2="550" stroke="#39805B" stroke-dasharray="4 4" opacity="0.3"/>
        <line x1="700" y1="50" x2="700" y2="550" stroke="#39805B" stroke-dasharray="4 4" opacity="0.3"/>
        <text x="110" y="80" fill="#DCEFE2" font-family="sans-serif" font-size="14" opacity="0.7">FLORAQ CHAMBER ALPHA-01 // RPI4 CAM CSI-01</text>
        <text x="110" y="100" fill="#39805B" font-family="sans-serif" font-size="12">EXP: ROSE QUEEN ELIZABETH // CYCLE 2</text>
        <!-- Plant pot -->
        <polygon points="320,530 480,530 450,440 350,440" fill="#2E2B2A"/>
        <ellipse cx="400" cy="440" rx="50" ry="12" fill="#1C1817"/>
        <!-- Main Stem -->
        <path d="M400,440 Q390,340 405,260 T400,160" fill="none" stroke="url(#stem)" stroke-width="12" stroke-linecap="round"/>
        <!-- Foliage -->
        <path d="M398,340 Q330,320 300,350 Q320,380 398,350" fill="url(#leaf)"/>
        <path d="M402,310 Q480,280 510,320 Q480,350 402,320" fill="url(#leaf)"/>
        <path d="M395,250 Q310,210 270,240 Q300,270 395,260" fill="url(#leaf)"/>
        <path d="M405,220 Q490,190 530,220 Q500,250 405,230" fill="url(#leaf)"/>
        <path d="M396,180 Q340,140 310,160 Q330,190 396,190" fill="url(#leaf)"/>
        <!-- Rose Blossom -->
        <circle cx="400" cy="140" r="38" fill="url(#petal)"/>
        <path d="M380,135 Q400,105 420,135 Q400,165 380,135" fill="#E83B5E" opacity="0.85"/>
        <circle cx="400" cy="138" r="16" fill="#FCE588"/>
      </svg>
    `)}`;

    const plantImage1: PlantImage = {
      id: 'img-rose-recent-01',
      owner_id: demoUserId,
      plant_id: 'plant-rose-01',
      cycle_id: 'cycle-rose-c2',
      camera_id: 'cam-csi-01',
      storage_key: 'chambers/alpha-01/rose/2026-10-12_230000.jpg',
      image_data_url: sampleRoseImgData,
      captured_at: new Date(now.getTime() - 3600000 * 2).toISOString(),
      uploaded_at: new Date(now.getTime() - 3600000 * 2 + 1500).toISOString(),
      capture_mode: 'scheduled',
      quality_status: 'optimal',
      dimensions: { width: 1920, height: 1080 },
      sensor_snapshot: {
        temperature: 27.2,
        humidity: 72.1,
        soil_moisture: 48.9,
        light_intensity: 12200,
      },
    };

    const plantImage2: PlantImage = {
      id: 'img-rose-baseline-00',
      owner_id: demoUserId,
      plant_id: 'plant-rose-01',
      cycle_id: 'cycle-rose-c1',
      camera_id: 'cam-csi-01',
      storage_key: 'chambers/alpha-01/rose/cycle1_day12.jpg',
      image_data_url: sampleRoseImgData,
      captured_at: new Date(now.getTime() - 86400000 * 12).toISOString(),
      uploaded_at: new Date(now.getTime() - 86400000 * 12 + 1200).toISOString(),
      capture_mode: 'manual',
      quality_status: 'optimal',
      dimensions: { width: 1920, height: 1080 },
      sensor_snapshot: {
        temperature: 24.1,
        humidity: 64.8,
        soil_moisture: 44.5,
        light_intensity: 9600,
      },
    };

    // Stored baseline AI analysis for the image
    const initialAIAnalysis: AIAnalysis = {
      id: 'ai-analysis-rose-01',
      owner_id: demoUserId,
      image_id: 'img-rose-recent-01',
      plant_id: 'plant-rose-01',
      cycle_id: 'cycle-rose-c2',
      analysis_type: 'disease_and_stress',
      model_identifier: 'gemini-3.8-flash',
      status: 'completed',
      result_json: {
        overall_health: 'healthy',
        confidence_score: 0.94,
        image_quality_check: {
          suitable_for_diagnosis: true,
          issues_detected: [],
        },
        visible_symptoms: [
          {
            symptom: 'Uniform deep green leaf coloration',
            region: 'Upper and middle canopy petioles',
            severity: 'mild',
            description: 'Vigorous chlorophyll saturation without interveinal chlorosis.',
          },
          {
            symptom: 'Minor margin curling at lowest mature leaf',
            region: 'Lower shaded node 2',
            severity: 'mild',
            description: 'Expected mechanical or micro-climatic humidity boundary effect; no necrotic spots or fungal sporulation.',
          },
        ],
        possible_conditions: [
          {
            condition_name: 'Healthy Botanical Specimen (No Active Pathogen)',
            classification: 'visible_symptom',
            probability_level: 'high',
            rationale: 'Absence of powdery mildew (Podosphaera pannosa), black spot (Diplocarpon rosae), or Botrytis blight.',
            is_confirmed_diagnosis: false,
          },
        ],
        growth_estimates: {
          canopy_coverage_percent: 64.5,
          estimated_leaf_count: 26,
          visible_vigor_rating: 9.2,
          calibration_note: 'Estimates based on fixed 60° FOV calibrated camera geometry at 65cm focal distance.',
        },
        conservative_recommendations: [
          'Maintain current 27°C day / 22°C night temperature differential.',
          'Continue precision drip volume of 1.2-1.4 L/day to preserve root zone aeration.',
          'Ensure exhaust HEPA circulation fan prevents stagnant moisture micro-pockets around lower foliage.',
        ],
        suggested_follow_up: 'Schedule next automated photo in 6 hours during peak afternoon photoperiod.',
        scientific_disclaimer:
          'FloraQ AI plant health observations represent visual symptom assessments and are not certified plant pathology diagnoses. Inspect leaves physically prior to altering chemical regimes.',
      },
      created_at: new Date(now.getTime() - 3600000 * 2 + 5000).toISOString(),
      completed_at: new Date(now.getTime() - 3600000 * 2 + 8200).toISOString(),
    };

    this.state = {
      profiles: [defaultProfile],
      chambers: [chamber1],
      plants: [plant1, plant2, plant3],
      growth_cycles: [cycle1Plant1, cycle2Plant1, cycle1Tomato, cycle1Zinnia],
      environmental_targets: targets,
      sensor_readings: readings,
      daily_observations: dailyObservations,
      care_events: careEvents,
      gateway_devices: [rpiGateway],
      cameras: [camera1],
      plant_images: [plantImage1, plantImage2],
      ai_analyses: [initialAIAnalysis],
      generated_visualizations: [],
      gateway_sync_logs: [
        {
          id: 'sync-log-001',
          gateway_id: 'rpi4-gw-001',
          sync_started_at: new Date(now.getTime() - 3600000).toISOString(),
          sync_completed_at: new Date(now.getTime() - 3600000 + 420).toISOString(),
          uploaded_count: 12,
          failed_count: 0,
          status: 'success',
        },
      ],
      audit_logs: [
        {
          id: 'audit-001',
          user_id: demoUserId,
          action: 'CYCLE_CREATED',
          entity_type: 'growth_cycle',
          entity_id: 'cycle-rose-c2',
          details: { reason: 'Elevated VPD and thermal optimization' },
          created_at: cycle2Plant1.start_at,
        },
      ],
    };

    this.saveState();
  }

  // --- Profiles ---
  getProfiles() {
    return this.state.profiles;
  }

  getProfileById(id: string) {
    return this.state.profiles.find((p) => p.id === id);
  }

  getProfileByPhone(phone: string) {
    return this.state.profiles.find((p) => p.phone_number.trim() === phone.trim());
  }

  createProfile(profile: UserProfile) {
    this.state.profiles.push(profile);
    this.saveState();
    return profile;
  }

  updateProfile(id: string, updates: Partial<UserProfile>) {
    const idx = this.state.profiles.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.state.profiles[idx] = { ...this.state.profiles[idx], ...updates, updated_at: new Date().toISOString() };
      this.saveState();
      return this.state.profiles[idx];
    }
    return null;
  }

  // --- Chambers ---
  getChambers() {
    return this.state.chambers;
  }

  getChamberById(id: string) {
    return this.state.chambers.find((c) => c.id === id);
  }

  // --- Plants ---
  getPlants(ownerId?: string) {
    if (ownerId) {
      return this.state.plants.filter((p) => p.owner_id === ownerId);
    }
    return this.state.plants;
  }

  getPlantById(id: string) {
    return this.state.plants.find((p) => p.id === id);
  }

  createPlant(plant: Plant) {
    this.state.plants.push(plant);
    this.saveState();
    return plant;
  }

  updatePlant(id: string, updates: Partial<Plant>) {
    const idx = this.state.plants.findIndex((p) => p.id === id);
    if (idx !== -1) {
      this.state.plants[idx] = { ...this.state.plants[idx], ...updates, updated_at: new Date().toISOString() };
      this.saveState();
      return this.state.plants[idx];
    }
    return null;
  }

  deletePlant(id: string) {
    const idx = this.state.plants.findIndex((p) => p.id === id);
    if (idx !== -1) {
      const removed = this.state.plants.splice(idx, 1)[0];
      this.saveState();
      return removed;
    }
    return null;
  }

  // --- Growth Cycles ---
  getCyclesByPlant(plantId: string) {
    return this.state.growth_cycles.filter((c) => c.plant_id === plantId).sort((a, b) => a.cycle_number - b.cycle_number);
  }

  getCycleById(id: string) {
    return this.state.growth_cycles.find((c) => c.id === id);
  }

  createCycle(cycle: GrowthCycle) {
    this.state.growth_cycles.push(cycle);
    this.saveState();
    return cycle;
  }

  updateCycle(id: string, updates: Partial<GrowthCycle>) {
    const idx = this.state.growth_cycles.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.state.growth_cycles[idx] = { ...this.state.growth_cycles[idx], ...updates, updated_at: new Date().toISOString() };
      this.saveState();
      return this.state.growth_cycles[idx];
    }
    return null;
  }

  // --- Environmental Targets ---
  getTargetsByCycle(cycleId: string) {
    return this.state.environmental_targets.filter((t) => t.cycle_id === cycleId);
  }

  createTarget(target: EnvironmentalTarget) {
    this.state.environmental_targets.push(target);
    this.saveState();
    return target;
  }

  updateTarget(id: string, updates: Partial<EnvironmentalTarget>) {
    const idx = this.state.environmental_targets.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.state.environmental_targets[idx] = { ...this.state.environmental_targets[idx], ...updates };
      this.saveState();
      return this.state.environmental_targets[idx];
    }
    return null;
  }

  // --- Sensor Readings & Idempotent Ingestion ---
  getReadings(plantId: string, options?: { cycleId?: string; parameter?: string; since?: string; limit?: number }) {
    let list = this.state.sensor_readings.filter((r) => r.plant_id === plantId);
    if (options?.cycleId) {
      list = list.filter((r) => r.cycle_id === options.cycleId);
    }
    if (options?.parameter) {
      list = list.filter((r) => r.parameter_name === options.parameter);
    }
    if (options?.since) {
      const sinceDate = new Date(options.since).getTime();
      list = list.filter((r) => new Date(r.device_timestamp).getTime() >= sinceDate);
    }
    list.sort((a, b) => new Date(b.device_timestamp).getTime() - new Date(a.device_timestamp).getTime());
    if (options?.limit) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  hasEventId(eventId: string): boolean {
    return this.state.sensor_readings.some((r) => r.event_id === eventId);
  }

  saveSensorReadings(readings: SensorReading[]) {
    // Idempotency check on event_id
    const newItems: SensorReading[] = [];
    for (const r of readings) {
      if (!this.hasEventId(r.event_id)) {
        newItems.push(r);
      }
    }
    if (newItems.length > 0) {
      this.state.sensor_readings.push(...newItems);
      // Keep state bounded if necessary, e.g., max 10,000 readings
      if (this.state.sensor_readings.length > 10000) {
        this.state.sensor_readings = this.state.sensor_readings.slice(-8000);
      }
      this.saveState();
    }
    return newItems.length;
  }

  // --- Daily Observations ---
  getObservations(plantId: string, cycleId?: string) {
    let list = this.state.daily_observations.filter((o) => o.plant_id === plantId);
    if (cycleId) {
      list = list.filter((o) => o.cycle_id === cycleId);
    }
    return list.sort((a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime());
  }

  createObservation(obs: DailyObservation) {
    this.state.daily_observations.push(obs);
    this.saveState();
    return obs;
  }

  // --- Care Events ---
  getCareEvents(plantId: string, cycleId?: string) {
    let list = this.state.care_events.filter((c) => c.plant_id === plantId);
    if (cycleId) {
      list = list.filter((c) => c.cycle_id === cycleId);
    }
    return list.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime());
  }

  createCareEvent(event: CareEvent) {
    this.state.care_events.push(event);
    this.saveState();
    return event;
  }

  // --- Gateways & Devices ---
  getGateways() {
    return this.state.gateway_devices;
  }

  getGatewayById(id: string) {
    return this.state.gateway_devices.find((g) => g.id === id);
  }

  getGatewayByApiKey(apiKey: string) {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    return this.state.gateway_devices.find((g) => g.api_key_hash === hash);
  }

  createGateway(gw: GatewayDevice) {
    this.state.gateway_devices.push(gw);
    this.saveState();
    return gw;
  }

  updateGateway(id: string, updates: Partial<GatewayDevice>) {
    const idx = this.state.gateway_devices.findIndex((g) => g.id === id);
    if (idx !== -1) {
      this.state.gateway_devices[idx] = { ...this.state.gateway_devices[idx], ...updates };
      this.saveState();
      return this.state.gateway_devices[idx];
    }
    return null;
  }

  logGatewaySync(log: GatewaySyncLog) {
    this.state.gateway_sync_logs.unshift(log);
    if (this.state.gateway_sync_logs.length > 500) {
      this.state.gateway_sync_logs = this.state.gateway_sync_logs.slice(0, 500);
    }
    this.saveState();
    return log;
  }

  getGatewaySyncLogs(gatewayId?: string) {
    if (gatewayId) {
      return this.state.gateway_sync_logs.filter((l) => l.gateway_id === gatewayId);
    }
    return this.state.gateway_sync_logs;
  }

  // --- Cameras ---
  getCameras(chamberId?: string) {
    if (chamberId) {
      return this.state.cameras.filter((c) => c.chamber_id === chamberId);
    }
    return this.state.cameras;
  }

  getCameraById(id: string) {
    return this.state.cameras.find((c) => c.id === id);
  }

  updateCamera(id: string, updates: Partial<CameraDevice>) {
    const idx = this.state.cameras.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.state.cameras[idx] = { ...this.state.cameras[idx], ...updates };
      this.saveState();
      return this.state.cameras[idx];
    }
    return null;
  }

  // --- Plant Images ---
  getPlantImages(plantId: string, options?: { cycleId?: string; mode?: string; limit?: number }) {
    let list = this.state.plant_images.filter((img) => img.plant_id === plantId);
    if (options?.cycleId) {
      list = list.filter((img) => img.cycle_id === options.cycleId);
    }
    if (options?.mode) {
      list = list.filter((img) => img.capture_mode === options.mode);
    }
    list.sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
    if (options?.limit) {
      list = list.slice(0, options.limit);
    }
    return list;
  }

  getImageById(id: string) {
    return this.state.plant_images.find((img) => img.id === id);
  }

  savePlantImage(image: PlantImage) {
    this.state.plant_images.unshift(image);
    this.saveState();
    return image;
  }

  deletePlantImage(id: string) {
    const idx = this.state.plant_images.findIndex((img) => img.id === id);
    if (idx !== -1) {
      const removed = this.state.plant_images.splice(idx, 1)[0];
      this.saveState();
      return removed;
    }
    return null;
  }

  // --- AI Analyses ---
  getAnalysesByPlant(plantId: string) {
    return this.state.ai_analyses
      .filter((a) => a.plant_id === plantId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  getAnalysisByImageId(imageId: string) {
    return this.state.ai_analyses.find((a) => a.image_id === imageId);
  }

  getAnalysisById(id: string) {
    return this.state.ai_analyses.find((a) => a.id === id);
  }

  saveAIAnalysis(analysis: AIAnalysis) {
    const existingIdx = this.state.ai_analyses.findIndex((a) => a.id === analysis.id);
    if (existingIdx !== -1) {
      this.state.ai_analyses[existingIdx] = analysis;
    } else {
      this.state.ai_analyses.unshift(analysis);
    }
    this.saveState();
    return analysis;
  }

  // --- Generated Visualizations ---
  getVisualizationsByPlant(plantId: string) {
    return this.state.generated_visualizations
      .filter((v) => v.plant_id === plantId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  saveVisualization(viz: GeneratedVisualization) {
    this.state.generated_visualizations.unshift(viz);
    this.saveState();
    return viz;
  }

  // --- Audit Logs ---
  logAudit(audit: Omit<AuditLog, 'id' | 'created_at'>) {
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...audit,
      created_at: new Date().toISOString(),
    };
    this.state.audit_logs.unshift(log);
    if (this.state.audit_logs.length > 1000) {
      this.state.audit_logs = this.state.audit_logs.slice(0, 1000);
    }
    this.saveState();
    return log;
  }
}

export const db = new FloraQDatabase();
