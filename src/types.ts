export type PhytopodZoneId = 'zone1' | 'zone2' | 'zone3' | 'zone4';

export interface IrrigationZoneHardware {
  id: PhytopodZoneId;
  zoneNumber: 1 | 2 | 3 | 4;
  label: string;
  gpio: number;
  relayModule: string;
  relayInputs: string;
  devices: string;
}

export interface IrrigationZoneState {
  active: boolean;
  lockout: boolean;
  lastUpdated?: string | null;
  error?: string | null;
}

export type SensorHealthStatus = 'ok' | 'missing' | 'error' | 'stale';

export interface TelemetryValidationReport {
  has_sensor_error: boolean;
  is_stale: boolean;
  has_missing_fields: boolean;
  missing_timestamp: boolean;
  missing_fields: string[];
  error_fields: string[];
  issues: string[];
  validated_at: string;
}

export interface PhytopodTelemetrySnapshot {
  temperature: number | null;
  humidity: number | null;
  light_intensity: number | null;
  soil_moisture_1: number | null;
  soil_moisture_2: number | null;
  soil_moisture_average: number | null;
  watering_enabled: boolean;
  watering_flag_present?: boolean;
  zones: Record<PhytopodZoneId, IrrigationZoneState>;
  sensor_status: {
    temperature: SensorHealthStatus;
    humidity: SensorHealthStatus;
    light_intensity: SensorHealthStatus;
    soil_moisture_1: SensorHealthStatus;
    soil_moisture_2: SensorHealthStatus;
    soil_moisture_average: SensorHealthStatus;
  };
  sensor_errors: Record<string, string>;
  timestamp: string | null;
  received_at: string | null;
  esp32_last_seen: string | null;
  rpi_last_seen: string | null;
  source: 'firebase_rtdb' | 'serial_bridge' | 'none';
  validation?: TelemetryValidationReport;
}

export interface PhytopodControlState {
  zone1: boolean;
  zone2: boolean;
  zone3: boolean;
  zone4: boolean;
  grow_light: 'ON' | 'OFF';
  exhaust_fan: 'ON' | 'OFF';
  water_zone_1: number;
  water_zone_2: number;
  water_zone_3: number;
  water_zone_4: number;
}

export interface UserProfile {
  id: string;
  phone_number: string;
  full_name: string;
  role: 'owner' | 'researcher' | 'operator';
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
  active_cycle?: GrowthCycle | null;
  latest_readings?: {
    temperature?: SensorReading;
    humidity?: SensorReading;
    soil_moisture?: SensorReading;
    soil_moisture_1?: SensorReading;
    soil_moisture_2?: SensorReading;
    soil_moisture_average?: SensorReading;
    light_intensity?: SensorReading;
  };
  chamber_status?: string;
  latest_image?: PlantImage | null;
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
  parameter_name: string;
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
  zone?: PhytopodZoneId | string;
  duration_seconds?: number;
  soil_moisture_before?: number | null;
  soil_moisture_after?: number | null;
  status?: 'completed' | 'blocked_disabled' | 'lockout_aborted' | 'stopped' | 'logged' | 'command_sent';
  created_at: string;
}

export interface CameraDevice {
  id: string;
  chamber_id: string;
  camera_name: string;
  camera_type: string;
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
  };
}

export interface PlantImage {
  id: string;
  owner_id: string;
  plant_id: string;
  cycle_id?: string | null;
  camera_id?: string;
  storage_key: string;
  image_data_url: string;
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
      is_confirmed_diagnosis: false;
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
  visualization_label: string;
  projected_parameters?: Record<string, string>;
  scenario_description?: string;
}

export interface GatewayDevice {
  id: string;
  chamber_id: string;
  gateway_name: string;
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

export interface PhytopodHardwareStatus {
  chamber_id: string;
  firebase_rtdb: {
    configured: boolean;
    database_url_present: boolean;
    telemetry_path: string;
    controls_path: string;
  };
  esp32: {
    device_id: string;
    online: boolean;
    last_seen_at: string | null;
    transport: string;
    watering_enabled: boolean;
  };
  raspberry_pi: {
    device_id: string;
    online: boolean;
    last_seen_at: string | null;
    last_serial_telemetry_at: string | null;
    camera_last_frame_at: string | null;
    ai_pipeline_ready: boolean;
  };
  latest_serial_telemetry: PhytopodTelemetrySnapshot | null;
}
