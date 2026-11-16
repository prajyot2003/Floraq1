import {
  UserProfile,
  Plant,
  GrowthCycle,
  EnvironmentalTarget,
  SensorReading,
  DailyObservation,
  CareEvent,
  CameraDevice,
  PlantImage,
  AIAnalysis,
  GeneratedVisualization,
  GatewayDevice,
  PhytopodHardwareStatus,
} from './types.js';

const TOKEN_KEY = 'floraq_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const errJson = await res.json();
      errorMsg = errJson.message || errJson.error || errorMsg;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async login(phone_number: string, password: string) {
    const data = await request<{ token: string; user: UserProfile }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone_number, password }),
    });
    setStoredToken(data.token);
    return data;
  },

  async register(phone_number: string, password: string, full_name: string) {
    const data = await request<{ token: string; user: UserProfile }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ phone_number, password, full_name }),
    });
    setStoredToken(data.token);
    return data;
  },

  async demoLogin() {
    const data = await request<{ token: string; user: UserProfile }>('/api/v1/auth/demo-login', {
      method: 'POST',
    });
    setStoredToken(data.token);
    return data;
  },

  async getMe() {
    return request<{ user: UserProfile }>('/api/v1/auth/me');
  },

  async logout() {
    try {
      await request('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      clearStoredToken();
    }
  },

  async resetPassword(phone_number: string, new_password: string) {
    return request<{ message: string }>('/api/v1/auth/recover', {
      method: 'POST',
      body: JSON.stringify({ phone_number, new_password }),
    });
  },

  async updateProfile(full_name: string) {
    return request<{ user: UserProfile }>('/api/v1/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ full_name }),
    });
  },

  // Plants
  async getPlants() {
    return request<{ plants: Plant[] }>('/api/v1/plants');
  },

  async getPlant(id: string) {
    return request<{
      plant: Plant;
      cycles: GrowthCycle[];
      active_cycle: GrowthCycle;
      latest_readings: SensorReading[];
      care_events: CareEvent[];
      observations: DailyObservation[];
      chamber: Record<string, unknown>;
      camera: CameraDevice | null;
      recent_images: PlantImage[];
      analyses: AIAnalysis[];
    }>(`/api/v1/plants/${id}`);
  },

  async createPlant(plantData: {
    plan_name: string;
    plant_name: string;
    species: string;
    chamber_id?: string;
    planting_date?: string;
    notes?: string;
  }) {
    return request<{ plant: Plant; cycle: GrowthCycle }>('/api/v1/plants', {
      method: 'POST',
      body: JSON.stringify(plantData),
    });
  },

  async updatePlant(id: string, updates: Partial<Plant>) {
    return request<{ plant: Plant }>(`/api/v1/plants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deletePlant(id: string) {
    return request<{ message: string }>(`/api/v1/plants/${id}`, {
      method: 'DELETE',
    });
  },

  // Growth Cycles
  async getCycles(plantId: string) {
    return request<{ cycles: GrowthCycle[] }>(`/api/v1/plants/${plantId}/cycles`);
  },

  async createCycle(plantId: string, data: {
    cycle_name: string;
    objective: string;
    initial_targets?: Record<string, number>;
    notes?: string;
  }) {
    return request<{ cycle: GrowthCycle }>(`/api/v1/plants/${plantId}/cycles`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCycle(cycleId: string, data: Partial<GrowthCycle>) {
    return request<{ cycle: GrowthCycle }>(`/api/v1/cycles/${cycleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getCycleComparison(plantId: string) {
    return request<{
      plant: Plant;
      comparison: Array<{
        cycle: GrowthCycle;
        stats: {
          temperature: { avg: number; min: number; max: number; samples: number } | null;
          humidity: { avg: number; min: number; max: number; samples: number } | null;
          soil_moisture: { avg: number; min: number; max: number; samples: number } | null;
          light_intensity: { avg: number; min: number; max: number; samples: number } | null;
          total_water_liters: number;
          fertilizer_events: number;
          observation_count: number;
          reading_samples: number;
        };
      }>;
    }>(`/api/v1/plants/${plantId}/cycle-comparison`);
  },

  // Environmental Targets
  async getTargets(cycleId: string) {
    return request<{ targets: EnvironmentalTarget[] }>(`/api/v1/cycles/${cycleId}/targets`);
  },

  async createTarget(cycleId: string, data: { parameter_name: string; target_value: number; unit?: string }) {
    return request<{ target: EnvironmentalTarget }>(`/api/v1/cycles/${cycleId}/targets`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Observations & Care
  async getObservations(plantId: string) {
    return request<{ observations: DailyObservation[] }>(`/api/v1/plants/${plantId}/observations`);
  },

  async createObservation(plantId: string, data: Partial<DailyObservation>) {
    return request<{ observation: DailyObservation }>(`/api/v1/plants/${plantId}/observations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getCareEvents(plantId: string) {
    return request<{ care_events: CareEvent[] }>(`/api/v1/plants/${plantId}/care-events`);
  },

  async createCareEvent(plantId: string, data: Partial<CareEvent>) {
    return request<{ care_event: CareEvent }>(`/api/v1/plants/${plantId}/care-events`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Readings & Telemetry
  async getReadings(plantId: string, options?: { parameter?: string; cycleId?: string; since?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (options?.parameter) params.set('parameter', options.parameter);
    if (options?.cycleId) params.set('cycleId', options.cycleId);
    if (options?.since) params.set('since', options.since);
    if (options?.limit) params.set('limit', String(options.limit));
    return request<{ readings: SensorReading[] }>(`/api/v1/plants/${plantId}/readings?${params.toString()}`);
  },

  // Hardware Simulator
  async sendSimulatedReading(data: {
    plant_id: string;
    temperature: number;
    humidity: number;
    soil_moisture?: number;
    soil_moisture_1?: number;
    soil_moisture_2?: number;
    light_intensity: number;
  }) {
    return request<{ message: string; items: SensorReading[] }>('/api/v1/simulator/send-reading', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Phytopod 360 Hardware & Irrigation Events
  async getPhytopodStatus() {
    return request<PhytopodHardwareStatus>('/api/v1/phytopod/status');
  },

  async logWateringEvent(data: {
    plant_id?: string;
    zone: string;
    duration_seconds?: number;
    source?: string;
    soil_moisture_before?: number | null;
    soil_moisture_after?: number | null;
    status: string;
    notes: string;
  }) {
    return request<{ care_event: CareEvent }>('/api/v1/phytopod/watering-events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Gateways
  async getGateways() {
    return request<{ gateways: GatewayDevice[]; sync_logs: Array<Record<string, unknown>> }>('/api/v1/gateways');
  },

  async registerGateway(data: { chamber_id: string; gateway_name: string; ip_address?: string }) {
    return request<{ gateway: GatewayDevice; generated_api_key: string }>('/api/v1/gateways/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Cameras & Live Streaming
  async getCameras() {
    return request<{ cameras: CameraDevice[] }>('/api/v1/cameras');
  },

  async startCameraSession(cameraId: string) {
    return request<{
      session_token: string;
      camera_id: string;
      camera_name: string;
      status: string;
      stream_type: string;
      signaling_url: string;
      snapshot_stream_url: string;
      framerate: number;
      resolution: string;
    }>('/api/v1/camera/session', {
      method: 'POST',
      body: JSON.stringify({ camera_id: cameraId, action: 'start' }),
    });
  },

  async stopCameraSession(cameraId: string) {
    return request<{ message: string }>('/api/v1/camera/session', {
      method: 'POST',
      body: JSON.stringify({ camera_id: cameraId, action: 'stop' }),
    });
  },

  async captureImage(data: {
    plant_id: string;
    camera_id?: string;
    image_data_url?: string;
    capture_mode?: 'manual' | 'scheduled';
    sensor_snapshot?: {
      temperature?: number;
      humidity?: number;
      soil_moisture?: number;
      soil_moisture_1?: number;
      soil_moisture_2?: number;
      soil_moisture_average?: number;
      light_intensity?: number;
    };
  }) {
    return request<{ image: PlantImage }>('/api/v1/camera/images', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getPlantImages(plantId: string, cycleId?: string) {
    const q = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : '';
    return request<{ images: PlantImage[] }>(`/api/v1/plants/${plantId}/images${q}`);
  },

  async getImageDetails(imageId: string) {
    return request<{ image: PlantImage; analysis: AIAnalysis | null }>(`/api/v1/images/${imageId}`);
  },

  async deleteImage(imageId: string) {
    return request<{ message: string }>(`/api/v1/images/${imageId}`, {
      method: 'DELETE',
    });
  },

  async updateCameraSchedule(data: {
    camera_id: string;
    scheduled_enabled: boolean;
    scheduled_interval_minutes: number;
    resolution?: string;
  }) {
    return request<{ message: string; configuration: Record<string, unknown> }>('/api/v1/camera/schedule', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // AI Analysis
  async analyzeImage(imageId: string, rasterizedDataUrl?: string) {
    return request<{ analysis: AIAnalysis }>(`/api/v1/images/${imageId}/analyze`, {
      method: 'POST',
      body: JSON.stringify(rasterizedDataUrl ? { rasterized_data_url: rasterizedDataUrl } : {}),
    });
  },

  async getPlantAnalyses(plantId: string) {
    return request<{ analyses: AIAnalysis[] }>(`/api/v1/plants/${plantId}/analyses`);
  },

  async generateGrowthVisualization(data: {
    plant_id: string;
    scenario_prompt: string;
    current_stage: string;
  }) {
    return request<{ visualization: GeneratedVisualization }>('/api/v1/images/generate-visualization', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getVisualizations(plantId: string) {
    return request<{ visualizations: GeneratedVisualization[] }>(`/api/v1/plants/${plantId}/visualizations`);
  },
};
