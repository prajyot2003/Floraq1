import express, { Response } from 'express';
import crypto from 'node:crypto';
import {
  db,
  Plant,
  GrowthCycle,
  EnvironmentalTarget,
  SensorReading,
  DailyObservation,
  CareEvent,
  PlantImage,
  AIAnalysis,
  GatewayDevice,
} from './db.js';
import {
  requireAuth,
  hashPassword,
  createSession,
  destroySession,
  AuthenticatedRequest,
} from './auth.js';
import {
  analyzePlantImage,
  generateGrowthScenarioVisualization,
  listAvailableGroqModels,
  GROQ_VISION_MODEL,
  GROQ_TEXT_MODEL,
} from './groq.js';

export const apiRouter = express.Router();

// --- Server-Sent Events (SSE) Bus for Live Telemetry ---
interface SSEClient {
  id: string;
  res: Response;
  userId?: string;
}

const sseClients = new Map<string, SSEClient>();

export function broadcastEvent(eventType: string, data: Record<string, unknown>) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [clientId, client] of sseClients.entries()) {
    try {
      client.res.write(payload);
    } catch {
      sseClients.delete(clientId);
    }
  }
}

// In-memory cache for latest camera frames (for snapshot refresh mode)
const latestCameraFrames = new Map<string, { dataUrl: string; updatedAt: string }>();

// -------------------------------------------------------------
// 1. AUTHENTICATION & USER PROFILE
// -------------------------------------------------------------

apiRouter.post('/auth/register', (req, res) => {
  const { phone_number, password, full_name } = req.body;
  if (!phone_number || !password) {
    res.status(400).json({ error: 'Phone number and password are required.' });
    return;
  }

  const existing = db.getProfileByPhone(phone_number);
  if (existing) {
    res.status(409).json({ error: 'An account with this phone number already exists.' });
    return;
  }

  const newId = `user-${Date.now()}`;
  const profile = db.createProfile({
    id: newId,
    phone_number: phone_number.trim(),
    password_hash: hashPassword(password),
    full_name: full_name?.trim() || 'FloraQ Cultivator',
    role: 'owner',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const token = createSession(profile.id);
  res.status(201).json({
    message: 'Registration successful',
    token,
    user: {
      id: profile.id,
      phone_number: profile.phone_number,
      full_name: profile.full_name,
      role: profile.role,
    },
  });
});

apiRouter.post('/auth/login', (req, res) => {
  const { phone_number, password } = req.body;
  if (!phone_number || !password) {
    res.status(400).json({ error: 'Phone number and password are required.' });
    return;
  }

  const user = db.getProfileByPhone(phone_number);
  if (!user || user.password_hash !== hashPassword(password)) {
    res.status(401).json({ error: 'Invalid phone number or password.' });
    return;
  }

  const token = createSession(user.id);
  res.json({
    message: 'Login successful',
    token,
    user: {
      id: user.id,
      phone_number: user.phone_number,
      full_name: user.full_name,
      role: user.role,
    },
  });
});

apiRouter.post('/auth/demo-login', (_req, res) => {
  const demoUser = db.getProfiles()[0];
  if (!demoUser) {
    res.status(500).json({ error: 'No default profile configured.' });
    return;
  }
  const token = createSession(demoUser.id);
  res.json({
    message: 'Demo login successful',
    token,
    user: {
      id: demoUser.id,
      phone_number: demoUser.phone_number,
      full_name: demoUser.full_name,
      role: demoUser.role,
    },
  });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  res.json({
    user: {
      id: user.id,
      phone_number: user.phone_number,
      full_name: user.full_name,
      role: user.role,
      created_at: user.created_at,
    },
  });
});

apiRouter.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    destroySession(authHeader.substring(7));
  }
  res.json({ message: 'Logged out successfully' });
});

apiRouter.post('/auth/recover', (req, res) => {
  const { phone_number, new_password } = req.body;
  if (!phone_number || !new_password) {
    res.status(400).json({ error: 'Phone number and new password required.' });
    return;
  }
  const user = db.getProfileByPhone(phone_number);
  if (!user) {
    res.status(404).json({ error: 'No account registered with this phone number.' });
    return;
  }
  db.updateProfile(user.id, { password_hash: hashPassword(new_password) });
  res.json({ message: 'Password has been securely reset. You can now log in.' });
});

apiRouter.put('/auth/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const { full_name } = req.body;
  const updated = db.updateProfile(req.user!.id, { full_name });
  res.json({ user: updated });
});

// -------------------------------------------------------------
// 2. SERVER-SENT EVENTS (SSE) STREAM
// -------------------------------------------------------------

apiRouter.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  sseClients.set(clientId, { id: clientId, res });

  // Send initial connection handshake
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, timestamp: new Date().toISOString() })}\n\n`);

  // Heartbeat ping every 25s
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(interval);
    sseClients.delete(clientId);
  });
});

// -------------------------------------------------------------
// 3. PLANTS & EXPERIMENT PLANS
// -------------------------------------------------------------

apiRouter.get('/plants', requireAuth, (req: AuthenticatedRequest, res) => {
  const plants = db.getPlants(req.user!.id);
  // Enhance with latest sensor readings and active cycle for quick dashboard cards
  const enriched = plants.map((p) => {
    const cycles = db.getCyclesByPlant(p.id);
    const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1] || null;
    const latestReadings = db.getReadings(p.id, { limit: 40 });
    const chamber = db.getChamberById(p.chamber_id);
    const images = db.getPlantImages(p.id, { limit: 1 });

    const getLatest = (param: string) => latestReadings.find((r) => r.parameter_name === param);

    return {
      ...p,
      active_cycle: activeCycle,
      latest_readings: {
        temperature: getLatest('temperature'),
        humidity: getLatest('humidity'),
        soil_moisture: getLatest('soil_moisture_average') || getLatest('soil_moisture'),
        soil_moisture_1: getLatest('soil_moisture_1'),
        soil_moisture_2: getLatest('soil_moisture_2'),
        soil_moisture_average: getLatest('soil_moisture_average') || getLatest('soil_moisture'),
        light_intensity: getLatest('light_intensity'),
      },
      chamber_status: chamber?.status || 'unknown',
      latest_image: images[0] || null,
    };
  });
  res.json({ plants: enriched });
});

apiRouter.post('/plants', requireAuth, (req: AuthenticatedRequest, res) => {
  const { plan_name, plant_name, species, chamber_id, planting_date, notes } = req.body;
  if (!plan_name || !plant_name || !species) {
    res.status(400).json({ error: 'Plan name, plant name, and species are required.' });
    return;
  }

  const existingPlants = db.getPlants(req.user!.id);
  const displayNumber = existingPlants.length + 1;
  const newPlantId = `plant-${Date.now()}`;
  const chamberId = chamber_id || db.getChambers()[0]?.id || 'chamber-alpha-01';

  const newPlant: Plant = {
    id: newPlantId,
    owner_id: req.user!.id,
    plan_name: plan_name.trim(),
    display_number: displayNumber,
    plant_name: plant_name.trim(),
    species: species.trim(),
    chamber_id: chamberId,
    planting_date: planting_date || new Date().toISOString().slice(0, 10),
    status: 'active',
    notes: notes || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.createPlant(newPlant);

  // Automatically initialize Cycle 1: Baseline Conditions
  const initialCycle: GrowthCycle = {
    id: `cycle-${newPlantId}-c1`,
    plant_id: newPlantId,
    cycle_number: 1,
    cycle_name: 'Cycle 1: Baseline Conditions',
    objective: 'Initial acclimatization and baseline telemetry monitoring.',
    start_at: new Date().toISOString(),
    end_at: null,
    status: 'active',
    initial_targets: { temperature: 25.0, humidity: 65.0, soil_moisture: 50.0, light_intensity: 10000 },
    notes: 'Auto-initialized upon plant registration.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.createCycle(initialCycle);

  // Targets
  const targetParams = [
    { name: 'temperature', val: 25.0, unit: '°C' },
    { name: 'humidity', val: 65.0, unit: '%' },
    { name: 'soil_moisture', val: 50.0, unit: '%' },
    { name: 'light_intensity', val: 10000, unit: 'lux' },
  ];
  for (const t of targetParams) {
    db.createTarget({
      id: `tgt-${newPlantId}-c1-${t.name}`,
      plant_id: newPlantId,
      cycle_id: initialCycle.id,
      parameter_name: t.name,
      target_value: t.val,
      unit: t.unit,
      effective_start: initialCycle.start_at,
      configured_by: req.user!.full_name,
      created_at: initialCycle.start_at,
    });
  }

  db.logAudit({
    user_id: req.user!.id,
    action: 'PLANT_CREATED',
    entity_type: 'plant',
    entity_id: newPlantId,
    details: { plan_name, plant_name, species },
  });

  res.status(201).json({ plant: newPlant, cycle: initialCycle });
});

apiRouter.get('/plants/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found or access denied.' });
    return;
  }

  const cycles = db.getCyclesByPlant(plant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1];
  const latestReadings = db.getReadings(plant.id, { limit: 350 });
  const careEvents = db.getCareEvents(plant.id);
  const observations = db.getObservations(plant.id);
  const chamber = db.getChamberById(plant.chamber_id);
  const camera = db.getCameras(plant.chamber_id)[0] || null;
  const recentImages = db.getPlantImages(plant.id);
  const analyses = db.getAnalysesByPlant(plant.id);

  res.json({
    plant,
    cycles,
    active_cycle: activeCycle,
    latest_readings: latestReadings,
    care_events: careEvents,
    observations: observations,
    chamber,
    camera,
    recent_images: recentImages,
    analyses: analyses,
  });
});

apiRouter.put('/plants/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found or access denied.' });
    return;
  }

  const { plan_name, plant_name, species, notes, planting_date, status } = req.body;
  const updated = db.updatePlant(plant.id, {
    plan_name,
    plant_name,
    species,
    notes,
    planting_date,
    status,
  });

  res.json({ plant: updated });
});

apiRouter.delete('/plants/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found or access denied.' });
    return;
  }

  db.deletePlant(plant.id);
  db.logAudit({
    user_id: req.user!.id,
    action: 'PLANT_DELETED',
    entity_type: 'plant',
    entity_id: plant.id,
    details: { plant_name: plant.plant_name },
  });

  res.json({ message: 'Plant removed successfully.' });
});

// -------------------------------------------------------------
// 4. GROWTH CYCLE MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/plants/:plantId/cycles', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }
  const cycles = db.getCyclesByPlant(plant.id);
  res.json({ cycles });
});

apiRouter.post('/plants/:plantId/cycles', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const { cycle_name, objective, initial_targets, notes } = req.body;
  if (!cycle_name) {
    res.status(400).json({ error: 'Cycle name is required.' });
    return;
  }

  const existingCycles = db.getCyclesByPlant(plant.id);
  // Mark previous active cycle as completed
  const now = new Date().toISOString();
  for (const prev of existingCycles) {
    if (prev.status === 'active') {
      db.updateCycle(prev.id, { status: 'completed', end_at: now });
    }
  }

  const newCycleNumber = existingCycles.length + 1;
  const newCycleId = `cycle-${plant.id}-c${newCycleNumber}-${Date.now()}`;

  const newCycle: GrowthCycle = {
    id: newCycleId,
    plant_id: plant.id,
    cycle_number: newCycleNumber,
    cycle_name: cycle_name.trim(),
    objective: objective || '',
    start_at: now,
    end_at: null,
    status: 'active',
    initial_targets: initial_targets || { temperature: 26, humidity: 70, soil_moisture: 50, light_intensity: 11000 },
    notes: notes || '',
    created_at: now,
    updated_at: now,
  };

  db.createCycle(newCycle);

  // Create targets if passed
  if (initial_targets && typeof initial_targets === 'object') {
    for (const [key, val] of Object.entries(initial_targets)) {
      const unit = key === 'temperature' ? '°C' : key === 'light_intensity' ? 'lux' : '%';
      db.createTarget({
        id: `tgt-${newCycleId}-${key}`,
        plant_id: plant.id,
        cycle_id: newCycleId,
        parameter_name: key,
        target_value: Number(val),
        unit,
        effective_start: now,
        configured_by: req.user!.full_name,
        created_at: now,
      });
    }
  }

  db.logAudit({
    user_id: req.user!.id,
    action: 'CYCLE_CREATED',
    entity_type: 'growth_cycle',
    entity_id: newCycleId,
    details: { cycle_name, cycle_number: newCycleNumber, previous_preserved: true },
  });

  res.status(201).json({ cycle: newCycle });
});

apiRouter.put('/cycles/:cycleId', requireAuth, (req: AuthenticatedRequest, res) => {
  const cycle = db.getCycleById(req.params.cycleId);
  if (!cycle) {
    res.status(404).json({ error: 'Growth cycle not found.' });
    return;
  }
  const { cycle_name, objective, status, notes } = req.body;
  const updated = db.updateCycle(cycle.id, {
    cycle_name,
    objective,
    status,
    notes,
    end_at: status === 'completed' && !cycle.end_at ? new Date().toISOString() : cycle.end_at,
  });

  res.json({ cycle: updated });
});

apiRouter.get('/plants/:plantId/cycle-comparison', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const cycles = db.getCyclesByPlant(plant.id);
  const comparisonData = cycles.map((c) => {
    const cycleReadings = db.getReadings(plant.id, { cycleId: c.id });
    const cycleCares = db.getCareEvents(plant.id, c.id);
    const cycleObs = db.getObservations(plant.id, c.id);

    const calcStats = (param: string) => {
      const vals = cycleReadings.filter((r) => r.parameter_name === param).map((r) => r.value);
      if (vals.length === 0) return null;
      const sum = vals.reduce((a, b) => a + b, 0);
      return {
        avg: parseFloat((sum / vals.length).toFixed(1)),
        min: Math.min(...vals),
        max: Math.max(...vals),
        samples: vals.length,
      };
    };

    const totalWater = cycleCares
      .filter((e) => e.event_type === 'watering' && e.quantity)
      .reduce((acc, curr) => acc + (curr.quantity || 0), 0);

    const fertCount = cycleCares.filter((e) => e.event_type === 'fertilizer').length;

    return {
      cycle: c,
      stats: {
        temperature: calcStats('temperature'),
        humidity: calcStats('humidity'),
        soil_moisture: calcStats('soil_moisture_average') || calcStats('soil_moisture'),
        light_intensity: calcStats('light_intensity'),
        total_water_liters: parseFloat(totalWater.toFixed(2)),
        fertilizer_events: fertCount,
        observation_count: cycleObs.length,
        reading_samples: cycleReadings.length,
      },
    };
  });

  res.json({ plant, comparison: comparisonData });
});

// -------------------------------------------------------------
// 5. ENVIRONMENTAL TARGETS
// -------------------------------------------------------------

apiRouter.get('/cycles/:cycleId/targets', requireAuth, (_req, res) => {
  const targets = db.getTargetsByCycle(_req.params.cycleId);
  res.json({ targets });
});

apiRouter.post('/cycles/:cycleId/targets', requireAuth, (req: AuthenticatedRequest, res) => {
  const cycle = db.getCycleById(req.params.cycleId);
  if (!cycle) {
    res.status(404).json({ error: 'Growth cycle not found.' });
    return;
  }

  const { parameter_name, target_value, unit, tolerance_min, tolerance_max } = req.body;
  if (!parameter_name || target_value === undefined) {
    res.status(400).json({ error: 'Parameter name and target value required.' });
    return;
  }

  const target: EnvironmentalTarget = {
    id: `tgt-${cycle.id}-${Date.now()}`,
    plant_id: cycle.plant_id,
    cycle_id: cycle.id,
    parameter_name,
    target_value: Number(target_value),
    unit: unit || '°C',
    tolerance_min,
    tolerance_max,
    effective_start: new Date().toISOString(),
    configured_by: req.user!.full_name,
    created_at: new Date().toISOString(),
  };

  db.createTarget(target);
  res.status(201).json({ target });
});

// -------------------------------------------------------------
// 6. DAILY OBSERVATIONS & CARE EVENTS
// -------------------------------------------------------------

apiRouter.get('/plants/:plantId/observations', requireAuth, (req, res) => {
  const obs = db.getObservations(req.params.plantId);
  res.json({ observations: obs });
});

apiRouter.post('/plants/:plantId/observations', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const {
    cycle_id,
    observed_at,
    temperature,
    humidity,
    soil_moisture,
    light_intensity,
    soil_ph,
    plant_height,
    health_observations,
    notes,
    image_url,
  } = req.body;

  const cycles = db.getCyclesByPlant(plant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1];

  const observation: DailyObservation = {
    id: `obs-${Date.now()}`,
    plant_id: plant.id,
    cycle_id: cycle_id || activeCycle?.id || 'cycle-default',
    observed_at: observed_at || new Date().toISOString(),
    temperature: temperature !== undefined && temperature !== '' ? Number(temperature) : null,
    humidity: humidity !== undefined && humidity !== '' ? Number(humidity) : null,
    soil_moisture: soil_moisture !== undefined && soil_moisture !== '' ? Number(soil_moisture) : null,
    light_intensity: light_intensity !== undefined && light_intensity !== '' ? Number(light_intensity) : null,
    soil_ph: soil_ph !== undefined && soil_ph !== '' ? Number(soil_ph) : null,
    plant_height: plant_height !== undefined && plant_height !== '' ? Number(plant_height) : null,
    health_observations: health_observations || 'Routine foliar inspection.',
    notes: notes || '',
    image_url,
    created_by: req.user!.full_name,
    created_at: new Date().toISOString(),
  };

  db.createObservation(observation);
  res.status(201).json({ observation });
});

apiRouter.get('/plants/:plantId/care-events', requireAuth, (req, res) => {
  const cares = db.getCareEvents(req.params.plantId);
  res.json({ care_events: cares });
});

apiRouter.post('/plants/:plantId/care-events', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const {
    event_type,
    event_time,
    quantity,
    unit,
    method,
    product_name,
    category,
    concentration,
    notes,
    source,
    zone,
    duration_seconds,
    soil_moisture_before,
    soil_moisture_after,
    status,
  } = req.body;
  if (!event_type) {
    res.status(400).json({ error: 'Event type is required.' });
    return;
  }

  const cycles = db.getCyclesByPlant(plant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1];

  const care: CareEvent = {
    id: `care-${Date.now()}`,
    plant_id: plant.id,
    cycle_id: activeCycle?.id || 'cycle-default',
    event_type,
    event_time: event_time || new Date().toISOString(),
    quantity: quantity !== undefined && quantity !== null && quantity !== '' ? Number(quantity) : undefined,
    unit: quantity !== undefined && quantity !== null && quantity !== '' ? (unit || 'L') : undefined,
    method: method || (zone ? `${zone.toUpperCase()} Relay` : 'Manual application'),
    product_name,
    category,
    concentration,
    notes: notes || '',
    source: source || 'manual',
    zone: zone || undefined,
    duration_seconds: duration_seconds !== undefined && duration_seconds !== null ? Number(duration_seconds) : undefined,
    soil_moisture_before:
      soil_moisture_before !== undefined && soil_moisture_before !== null ? Number(soil_moisture_before) : undefined,
    soil_moisture_after:
      soil_moisture_after !== undefined && soil_moisture_after !== null ? Number(soil_moisture_after) : undefined,
    status: status || 'logged',
    created_at: new Date().toISOString(),
  };

  db.createCareEvent(care);
  res.status(201).json({ care_event: care });
});

// -------------------------------------------------------------
// 7. SENSOR READINGS & CHARTS API
// -------------------------------------------------------------

apiRouter.get('/plants/:plantId/readings', requireAuth, (req, res) => {
  const { parameter, cycleId, since, limit } = req.query;
  const readings = db.getReadings(req.params.plantId, {
    parameter: typeof parameter === 'string' ? parameter : undefined,
    cycleId: typeof cycleId === 'string' ? cycleId : undefined,
    since: typeof since === 'string' ? since : undefined,
    limit: limit ? Number(limit) : 200,
  });
  res.json({ readings });
});

// CSV Export
apiRouter.get('/plants/:plantId/export.csv', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).send('Plant not found');
    return;
  }

  const readings = db.getReadings(plant.id, { limit: 2000 });
  const headers = ['Timestamp_ISO', 'Parameter', 'Value', 'Unit', 'Cycle_ID', 'Device_ID', 'Data_Source', 'Quality'];
  const rows = readings.map((r) => [
    r.device_timestamp,
    r.parameter_name,
    r.value,
    r.unit,
    r.cycle_id || '',
    r.device_id,
    r.data_source,
    r.quality_status,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="floraq-${plant.plan_name.replace(/\s+/g, '_')}-telemetry.csv"`);
  res.send(csvContent);
});

// -------------------------------------------------------------
// 8. IOT INGESTION PIPELINE (RASPBERRY PI 4 -> BACKEND)
// -------------------------------------------------------------

/**
 * POST /api/v1/iot/ingest
 * Authenticates Gateway using X-Gateway-Key or Authorization Bearer header.
 * Validates schema, idempotency (event_id), chamber & plant assignment.
 */
apiRouter.post('/iot/ingest', (req, res) => {
  const authHeader = req.headers['x-gateway-key'] || req.headers.authorization;
  let apiKey = '';

  if (typeof authHeader === 'string') {
    apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }

  if (!apiKey) {
    res.status(401).json({
      error: 'Unauthorized gateway',
      message: 'Missing gateway authentication key in X-Gateway-Key or Bearer header.',
    });
    return;
  }

  const gateway = db.getGatewayByApiKey(apiKey);
  if (!gateway) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid gateway key or gateway not provisioned for this chamber.',
    });
    return;
  }

  const payload = req.body;
  if (!payload || !payload.chamber_id || !payload.device_id || !Array.isArray(payload.measurements)) {
    res.status(400).json({
      error: 'Invalid schema',
      message: 'Payload must contain schema_version, chamber_id, device_id, and measurements array.',
    });
    return;
  }

  // Verify chamber assignment
  if (gateway.chamber_id !== payload.chamber_id) {
    res.status(403).json({
      error: 'Chamber mismatch',
      message: `Gateway ${gateway.id} is authorized only for chamber ${gateway.chamber_id}, not ${payload.chamber_id}.`,
    });
    return;
  }

  // Locate active plant in chamber
  const chamberPlants = db.getPlants().filter((p) => p.chamber_id === payload.chamber_id && p.status === 'active');
  const targetPlant = chamberPlants[0];
  if (!targetPlant) {
    res.status(404).json({
      error: 'No active plant',
      message: `Chamber ${payload.chamber_id} does not have an active plant assigned. Readings buffered but unassigned.`,
    });
    return;
  }

  const cycles = db.getCyclesByPlant(targetPlant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || null;

  const now = new Date().toISOString();
  const baseEventId = payload.event_id || `evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const deviceTimestamp = payload.device_timestamp || now;

  const readingsToSave: SensorReading[] = [];

  for (let idx = 0; idx < payload.measurements.length; idx++) {
    const m = payload.measurements[idx];
    if (!m.parameter || m.value === undefined) continue;

    const eventId = `${baseEventId}-${m.parameter}-${idx}`;
    // Idempotency check: if reading with eventId already exists, skip
    if (db.hasEventId(eventId)) {
      continue;
    }

    readingsToSave.push({
      id: `reading-${Date.now()}-${idx}`,
      plant_id: targetPlant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: payload.chamber_id,
      device_id: payload.device_id,
      gateway_id: gateway.id,
      event_id: eventId,
      parameter_name: m.parameter,
      value: Number(m.value),
      unit: m.unit || '',
      device_timestamp: deviceTimestamp,
      received_at: now,
      data_source: 'hardware_gateway',
      quality_status: 'valid',
    });
  }

  const savedCount = db.saveSensorReadings(readingsToSave);

  // Update Gateway status & health
  db.updateGateway(gateway.id, {
    status: 'connected',
    last_seen_at: now,
    last_ingestion_at: now,
    queued_count: payload.queued_readings_count || 0,
    last_error: null,
  });

  // Log sync
  db.logGatewaySync({
    id: `sync-${Date.now()}`,
    gateway_id: gateway.id,
    sync_started_at: now,
    sync_completed_at: now,
    uploaded_count: savedCount,
    failed_count: 0,
    status: 'success',
  });

  // Broadcast real-time SSE event to all connected UI clients
  broadcastEvent('sensor_telemetry', {
    plant_id: targetPlant.id,
    chamber_id: payload.chamber_id,
    gateway_id: gateway.id,
    device_id: payload.device_id,
    timestamp: deviceTimestamp,
    readings: readingsToSave,
  });

  res.status(200).json({
    status: 'acknowledged',
    ingested_count: savedCount,
    plant_id: targetPlant.id,
    cycle_id: activeCycle?.id || null,
    server_timestamp: now,
  });
});

// Simulator bench for testing pipeline ingestion & charts directly from UI
apiRouter.post('/simulator/send-reading', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    plant_id,
    temperature,
    humidity,
    soil_moisture,
    soil_moisture_1,
    soil_moisture_2,
    light_intensity,
  } = req.body;
  const plant = db.getPlantById(plant_id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const cycles = db.getCyclesByPlant(plant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[0];
  const now = new Date().toISOString();
  const eventId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const s1 = soil_moisture_1 !== undefined ? Number(soil_moisture_1) : Number(soil_moisture);
  const s2 = soil_moisture_2 !== undefined ? Number(soil_moisture_2) : Number(soil_moisture);
  const sAvg = Number(((s1 + s2) / 2).toFixed(1));

  const items: SensorReading[] = [
    {
      id: `sim-${Date.now()}-temp`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-temp`,
      parameter_name: 'temperature',
      value: Number(temperature),
      unit: '°C',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-hum`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-hum`,
      parameter_name: 'humidity',
      value: Number(humidity),
      unit: '%',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-soil1`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-soil1`,
      parameter_name: 'soil_moisture_1',
      value: s1,
      unit: '%',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-soil2`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-soil2`,
      parameter_name: 'soil_moisture_2',
      value: s2,
      unit: '%',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-soil-avg`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-soil-avg`,
      parameter_name: 'soil_moisture_average',
      value: sAvg,
      unit: '%',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-soil`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-soil`,
      parameter_name: 'soil_moisture',
      value: sAvg,
      unit: '%',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
    {
      id: `sim-${Date.now()}-light`,
      plant_id: plant.id,
      cycle_id: activeCycle?.id || null,
      chamber_id: plant.chamber_id,
      device_id: 'esp32-phytopod-01',
      gateway_id: 'rpi4-gw-001',
      event_id: `${eventId}-light`,
      parameter_name: 'light_intensity',
      value: Number(light_intensity),
      unit: 'lux',
      device_timestamp: now,
      received_at: now,
      data_source: 'simulator_test',
      quality_status: 'valid',
    },
  ];

  db.saveSensorReadings(items);

  broadcastEvent('sensor_telemetry', {
    plant_id: plant.id,
    chamber_id: plant.chamber_id,
    gateway_id: 'rpi4-gw-001',
    device_id: 'esp32-phytopod-01',
    timestamp: now,
    readings: items,
  });

  res.json({ message: 'Test telemetry successfully ingested and broadcast.', items });
});

// -------------------------------------------------------------
// 9. PHYTOPOD 360 HARDWARE BRIDGE & GATEWAY MANAGEMENT
// -------------------------------------------------------------

interface PhytopodRuntime {
  esp32_last_seen: string | null;
  rpi_last_seen: string | null;
  last_serial_telemetry_at: string | null;
  watering_enabled: boolean;
  esp32_serial_connected: boolean;
  ai_pipeline_ready: boolean;
  latest_serial_telemetry: Record<string, unknown> | null;
}

const phytopodRuntime: PhytopodRuntime = {
  esp32_last_seen: null,
  rpi_last_seen: null,
  last_serial_telemetry_at: null,
  watering_enabled: false,
  esp32_serial_connected: false,
  ai_pipeline_ready: false,
  latest_serial_telemetry: null,
};

function isRecentTimestamp(iso: string | null | undefined, maxAgeMs = 120_000): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && Date.now() - ms <= maxAgeMs;
}

apiRouter.get('/phytopod/status', requireAuth, (_req, res) => {
  const camera = db.getCameras('chamber-alpha-01')[0] || null;
  const envUrl = process.env.VITE_FIREBASE_DATABASE_URL?.trim() || '';
  const isValidRtdb = (u: string) =>
    u.startsWith('https://') && (u.includes('firebaseio.com') || u.includes('firebasedatabase.app'));
  const dbUrl = isValidRtdb(envUrl)
    ? envUrl
    : 'https://plant-chamber-default-rtdb.europe-west1.firebasedatabase.app';
  const firebaseConfigured = isValidRtdb(dbUrl);

  res.json({
    chamber_id: 'chamber-alpha-01',
    firebase_rtdb: {
      configured: firebaseConfigured,
      database_url_present: Boolean(dbUrl),
      telemetry_path: '/telemetry',
      controls_path: '/commands',
    },
    esp32: {
      device_id: 'esp32-phytopod-01',
      online: isRecentTimestamp(phytopodRuntime.esp32_last_seen),
      last_seen_at: phytopodRuntime.esp32_last_seen,
      transport: phytopodRuntime.esp32_serial_connected ? 'Firebase RTDB + USB Serial' : 'Firebase RTDB',
      watering_enabled: phytopodRuntime.watering_enabled,
    },
    raspberry_pi: {
      device_id: 'rpi4-gw-001',
      online: isRecentTimestamp(phytopodRuntime.rpi_last_seen) || isRecentTimestamp(camera?.last_frame_at),
      last_seen_at: phytopodRuntime.rpi_last_seen,
      last_serial_telemetry_at: phytopodRuntime.last_serial_telemetry_at,
      camera_last_frame_at: camera?.last_frame_at || null,
      ai_pipeline_ready: phytopodRuntime.ai_pipeline_ready,
    },
    latest_serial_telemetry: phytopodRuntime.latest_serial_telemetry,
  });
});

apiRouter.post('/phytopod/heartbeat', (req, res) => {
  const authHeader = req.headers['x-gateway-key'] || req.headers.authorization;
  let apiKey = '';
  if (typeof authHeader === 'string') {
    apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  const gateway = db.getGatewayByApiKey(apiKey);
  if (!gateway) {
    res.status(401).json({ error: 'Unauthorized Raspberry Pi gateway key.' });
    return;
  }

  const now = new Date().toISOString();
  const { esp32_serial_connected, watering_enabled, ai_pipeline_ready } = req.body || {};

  phytopodRuntime.rpi_last_seen = now;
  if (esp32_serial_connected !== undefined) {
    phytopodRuntime.esp32_serial_connected = Boolean(esp32_serial_connected);
    if (phytopodRuntime.esp32_serial_connected) {
      phytopodRuntime.esp32_last_seen = now;
    }
  }
  if (watering_enabled !== undefined) {
    phytopodRuntime.watering_enabled = Boolean(watering_enabled);
  }
  if (ai_pipeline_ready !== undefined) {
    phytopodRuntime.ai_pipeline_ready = Boolean(ai_pipeline_ready);
  }

  db.updateGateway(gateway.id, {
    status: 'connected',
    last_seen_at: now,
  });

  broadcastEvent('phytopod_status', {
    rpi_last_seen: now,
    esp32_serial_connected: phytopodRuntime.esp32_serial_connected,
    watering_enabled: phytopodRuntime.watering_enabled,
  });

  res.json({ status: 'ok', server_timestamp: now });
});

apiRouter.post('/phytopod/serial-telemetry', (req, res) => {
  const authHeader = req.headers['x-gateway-key'] || req.headers.authorization;
  let apiKey = '';
  if (typeof authHeader === 'string') {
    apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }
  const gateway = db.getGatewayByApiKey(apiKey);
  if (!gateway) {
    res.status(401).json({ error: 'Unauthorized Raspberry Pi gateway key.' });
    return;
  }

  const payload = req.body || {};
  const now = new Date().toISOString();
  const chamberId = payload.chamber_id || gateway.chamber_id;
  const chamberPlants = db.getPlants().filter((p) => p.chamber_id === chamberId && p.status === 'active');
  const targetPlant = chamberPlants[0];

  phytopodRuntime.rpi_last_seen = now;
  phytopodRuntime.esp32_last_seen = now;
  phytopodRuntime.last_serial_telemetry_at = now;
  phytopodRuntime.esp32_serial_connected = true;
  if (payload.watering_enabled !== undefined) {
    phytopodRuntime.watering_enabled = Boolean(payload.watering_enabled);
  }
  phytopodRuntime.latest_serial_telemetry = { ...payload, received_at: now, source: 'serial_bridge' };

  const savedItems: SensorReading[] = [];
  if (targetPlant) {
    const cycles = db.getCyclesByPlant(targetPlant.id);
    const activeCycle = cycles.find((c) => c.status === 'active') || null;
    const baseEventId = payload.event_id || `usb-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const deviceTs = payload.timestamp || now;

    const addMetric = (param: string, rawVal: unknown, unit: string) => {
      if (rawVal === null || rawVal === undefined || rawVal === '' || typeof rawVal === 'boolean') return;
      const num = Number(rawVal);
      if (!Number.isFinite(num)) return;
      savedItems.push({
        id: `reading-${Date.now()}-${param}-${Math.random().toString(36).slice(2, 5)}`,
        plant_id: targetPlant.id,
        cycle_id: activeCycle?.id || null,
        chamber_id: chamberId,
        device_id: payload.device_id || 'esp32-phytopod-01',
        gateway_id: gateway.id,
        event_id: `${baseEventId}-${param}`,
        parameter_name: param,
        value: num,
        unit,
        device_timestamp: deviceTs,
        received_at: now,
        data_source: 'usb_serial',
        quality_status: 'valid',
      });
    };

    addMetric('temperature', payload.temperature, '°C');
    addMetric('humidity', payload.humidity, '%');
    addMetric('light_intensity', payload.light_intensity ?? payload.lux, 'lux');
    addMetric('soil_moisture_1', payload.soil_moisture_1, '%');
    addMetric('soil_moisture_2', payload.soil_moisture_2, '%');
    const s1 = Number(payload.soil_moisture_1);
    const s2 = Number(payload.soil_moisture_2);
    const avg =
      payload.soil_moisture_average !== undefined
        ? payload.soil_moisture_average
        : Number.isFinite(s1) && Number.isFinite(s2)
        ? Number(((s1 + s2) / 2).toFixed(1))
        : undefined;
    addMetric('soil_moisture_average', avg, '%');
    addMetric('soil_moisture', avg, '%');

    if (savedItems.length > 0) {
      db.saveSensorReadings(savedItems);
      broadcastEvent('sensor_telemetry', {
        plant_id: targetPlant.id,
        chamber_id: chamberId,
        gateway_id: gateway.id,
        device_id: payload.device_id || 'esp32-phytopod-01',
        timestamp: deviceTs,
        readings: savedItems,
      });
    }
  }

  db.updateGateway(gateway.id, {
    status: 'connected',
    last_seen_at: now,
    last_ingestion_at: now,
  });

  res.json({ status: 'ingested', saved_count: savedItems.length, server_timestamp: now });
});

apiRouter.post('/phytopod/watering-events', requireAuth, (req: AuthenticatedRequest, res) => {
  const {
    plant_id,
    zone,
    duration_seconds,
    source,
    soil_moisture_before,
    soil_moisture_after,
    status,
    notes,
  } = req.body || {};

  const targetPlant = plant_id
    ? db.getPlantById(plant_id)
    : db.getPlants(req.user!.id).find((p) => p.status === 'active') || db.getPlants(req.user!.id)[0];

  if (!targetPlant || targetPlant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Target plant not found for watering log.' });
    return;
  }

  const cycles = db.getCyclesByPlant(targetPlant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1];
  const now = new Date().toISOString();

  const care: CareEvent = {
    id: `care-zone-${Date.now()}`,
    plant_id: targetPlant.id,
    cycle_id: activeCycle?.id || 'cycle-default',
    event_type: 'watering',
    event_time: now,
    method: zone ? `${zone.toUpperCase()} Paired Motor + Solenoid Valve` : '4-Zone Irrigation System',
    notes: notes || '',
    source: source || 'firebase_rtdb',
    zone: zone || 'zone1',
    duration_seconds: duration_seconds !== undefined && duration_seconds !== null ? Number(duration_seconds) : undefined,
    soil_moisture_before:
      soil_moisture_before !== undefined && soil_moisture_before !== null ? Number(soil_moisture_before) : undefined,
    soil_moisture_after:
      soil_moisture_after !== undefined && soil_moisture_after !== null ? Number(soil_moisture_after) : undefined,
    status: status || 'command_sent',
    created_at: now,
  };

  db.createCareEvent(care);
  broadcastEvent('care_event_logged', { care_event: care });
  res.status(201).json({ care_event: care });
});

apiRouter.get('/gateways', requireAuth, (_req, res) => {
  const gateways = db.getGateways().map((gw) => ({
    ...gw,
    // Truthful online determination based on real heartbeat/ingestion age
    status: isRecentTimestamp(gw.last_ingestion_at || (gw.status === 'connected' ? gw.last_seen_at : null))
      ? 'connected'
      : 'offline',
  }));
  const syncLogs = db.getGatewaySyncLogs();
  res.json({ gateways, sync_logs: syncLogs.slice(0, 50) });
});

apiRouter.post('/gateways/register', requireAuth, (req: AuthenticatedRequest, res) => {
  const { chamber_id, gateway_name, ip_address } = req.body;
  const rawKey = `floraq_gw_${crypto.randomBytes(16).toString('hex')}`;
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const newGw: GatewayDevice = {
    id: `rpi4-${Date.now()}`,
    chamber_id: chamber_id || 'chamber-alpha-01',
    gateway_name: gateway_name || 'Raspberry Pi 4 Gateway',
    api_key_hash: keyHash,
    plain_api_key_preview: rawKey,
    status: 'offline',
    last_seen_at: new Date(0).toISOString(),
    ip_address: ip_address || '192.168.1.140',
    firmware_version: 'phytopod-rpi-v3.0',
    queued_count: 0,
    created_at: new Date().toISOString(),
  };

  db.createGateway(newGw);
  res.status(201).json({ gateway: newGw, generated_api_key: rawKey });
});

// -------------------------------------------------------------
// 10. CAMERA & LIVE VIDEO STREAMING
// -------------------------------------------------------------

apiRouter.get('/cameras', requireAuth, (_req, res) => {
  const cameras = db.getCameras();
  res.json({ cameras });
});

/**
 * POST /api/v1/camera/session
 * Requests an authenticated live video session for a camera.
 * Generates short-lived viewer session token.
 */
apiRouter.post('/camera/session', requireAuth, (req: AuthenticatedRequest, res) => {
  const { camera_id, action } = req.body;
  const camera = db.getCameraById(camera_id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found.' });
    return;
  }

  if (action === 'stop') {
    db.updateCamera(camera.id, { status: 'standby' });
    broadcastEvent('camera_status', { camera_id: camera.id, status: 'standby' });
    res.json({ message: 'Live stream stopped.' });
    return;
  }

  // Start authenticated session
  db.updateCamera(camera.id, { status: 'streaming', last_seen_at: new Date().toISOString() });
  const sessionToken = `vtok_${crypto.randomBytes(16).toString('hex')}`;

  broadcastEvent('camera_status', { camera_id: camera.id, status: 'streaming' });

  res.json({
    session_token: sessionToken,
    camera_id: camera.id,
    camera_name: camera.camera_name,
    chamber_id: camera.chamber_id,
    status: 'streaming',
    stream_type: 'webrtc_with_snapshot_fallback',
    signaling_url: `/api/v1/camera/signaling`,
    snapshot_stream_url: `/api/v1/camera/stream/${camera.id}/live.jpg?token=${sessionToken}`,
    framerate: camera.configuration.framerate,
    resolution: camera.configuration.resolution,
  });
});

/**
 * WebRTC Signalling exchange endpoint (SDP Offer/Answer & ICE candidate)
 */
apiRouter.post('/camera/signaling', requireAuth, (req: AuthenticatedRequest, res) => {
  const { camera_id, type, sdp, candidate } = req.body;
  const camera = db.getCameraById(camera_id);
  if (!camera) {
    res.status(404).json({ error: 'Camera device not found.' });
    return;
  }

  if (type === 'offer') {
    // In our WebRTC signalling architecture, return answering SDP or simulated low-latency stream pipe
    const mockAnswer = {
      type: 'answer',
      sdp: 'v=0\r\no=floraq_rpi4 12345 67890 IN IP4 127.0.0.1\r\ns=FloraQ-Rpi4-Stream\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\nc=IN IP4 0.0.0.0\r\n',
    };
    res.json({ answer: mockAnswer });
    return;
  }

  res.json({ status: 'signaling_processed', candidate: candidate ? 'received' : 'none' });
});

/**
 * Endpoint for Raspberry Pi gateway to push live snapshot frame
 */
apiRouter.post('/camera/snapshot-frame', (req, res) => {
  const authHeader = req.headers['x-gateway-key'] || req.headers.authorization;
  let apiKey = '';
  if (typeof authHeader === 'string') {
    apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
  }

  const gateway = db.getGatewayByApiKey(apiKey);
  if (!gateway) {
    res.status(401).json({ error: 'Unauthorized gateway.' });
    return;
  }

  const { camera_id, frame_data_url } = req.body;
  if (!camera_id || !frame_data_url) {
    res.status(400).json({ error: 'Missing camera_id or frame_data_url.' });
    return;
  }

  const camera = db.getCameraById(camera_id);
  if (camera) {
    const now = new Date().toISOString();
    db.updateCamera(camera.id, { last_frame_at: now, last_seen_at: now });
    latestCameraFrames.set(camera.id, { dataUrl: frame_data_url, updatedAt: now });

    broadcastEvent('camera_frame', {
      camera_id: camera.id,
      timestamp: now,
      frame_data_url: frame_data_url,
    });
  }

  res.json({ status: 'frame_received' });
});

/**
 * Returns latest snapshot frame for lower-bandwidth snapshot refresh fallback
 */
apiRouter.get('/camera/stream/:cameraId/live.jpg', (req, res) => {
  const frame = latestCameraFrames.get(req.params.cameraId);
  if (frame && frame.dataUrl) {
    const base64 = frame.dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imgBuf = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(imgBuf);
  } else {
    // Generate clean SVG stand-in if RPi hasn't pushed yet
    const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#142B20"/><text x="120" y="240" fill="#DCEFE2" font-family="sans-serif" font-size="20">FloraQ RPi Camera Standby [Live Standby]</text></svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(placeholder);
  }
});

/**
 * POST /api/v1/camera/images
 * Save captured plant photograph (on-demand or scheduled)
 */
apiRouter.post('/camera/images', requireAuth, (req: AuthenticatedRequest, res) => {
  const { plant_id, camera_id, image_data_url, capture_mode, sensor_snapshot } = req.body;
  const plant = db.getPlantById(plant_id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  // Manual captures use the latest frame pushed by the Raspberry Pi camera.
  const cameraId = camera_id || 'cam-csi-01';
  const liveFrame = latestCameraFrames.get(cameraId);
  const liveFrameFresh = liveFrame && Date.now() - new Date(liveFrame.updatedAt).getTime() < 30_000;
  const photoDataUrl = image_data_url || (liveFrameFresh ? liveFrame!.dataUrl : '');
  if (!photoDataUrl) {
    res.status(409).json({
      error: 'No live frame from the Raspberry Pi camera in the last 30 seconds. Check that floraq-camera is running on the Pi.',
    });
    return;
  }

  const cycles = db.getCyclesByPlant(plant.id);
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1];
  const now = new Date().toISOString();
  const imageId = `img-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const plantImage: PlantImage = {
    id: imageId,
    owner_id: req.user!.id,
    plant_id: plant.id,
    cycle_id: activeCycle?.id || null,
    camera_id: cameraId,
    storage_key: `chambers/${plant.chamber_id}/plants/${plant.id}/${imageId}.jpg`,
    image_data_url: photoDataUrl,
    captured_at: now,
    uploaded_at: now,
    capture_mode: capture_mode || 'manual',
    quality_status: 'optimal',
    sensor_snapshot: sensor_snapshot || undefined,
  };

  db.savePlantImage(plantImage);
  broadcastEvent('new_plant_image', { image: plantImage });

  res.status(201).json({ image: plantImage });
});

apiRouter.get('/plants/:plantId/images', requireAuth, (req: AuthenticatedRequest, res) => {
  const plant = db.getPlantById(req.params.plantId);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const { cycleId, mode } = req.query;
  const images = db.getPlantImages(plant.id, {
    cycleId: typeof cycleId === 'string' ? cycleId : undefined,
    mode: typeof mode === 'string' ? mode : undefined,
  });

  res.json({ images });
});

apiRouter.get('/images/:imageId', requireAuth, (req: AuthenticatedRequest, res) => {
  const image = db.getImageById(req.params.imageId);
  if (!image || image.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  const analysis = db.getAnalysisByImageId(image.id);
  res.json({ image, analysis });
});

apiRouter.delete('/images/:imageId', requireAuth, (req: AuthenticatedRequest, res) => {
  const image = db.getImageById(req.params.imageId);
  if (!image || image.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }

  db.deletePlantImage(image.id);
  res.json({ message: 'Photograph removed from private storage.' });
});

/**
 * Configure automated scheduled captures
 */
apiRouter.post('/camera/schedule', requireAuth, (req: AuthenticatedRequest, res) => {
  const { camera_id, scheduled_enabled, scheduled_interval_minutes, resolution } = req.body;
  const camera = db.getCameraById(camera_id);
  if (!camera) {
    res.status(404).json({ error: 'Camera not found.' });
    return;
  }

  const updatedConfig = {
    ...camera.configuration,
    scheduled_enabled: scheduled_enabled !== undefined ? Boolean(scheduled_enabled) : camera.configuration.scheduled_enabled,
    scheduled_interval_minutes: scheduled_interval_minutes ? Number(scheduled_interval_minutes) : camera.configuration.scheduled_interval_minutes,
    resolution: resolution || camera.configuration.resolution,
  };

  db.updateCamera(camera.id, { configuration: updatedConfig });
  res.json({ message: 'Scheduled capture configuration saved.', configuration: updatedConfig });
});

// -------------------------------------------------------------
// 11. AI PLANT DISEASE DETECTION & GROWTH VISUALIZATION
// -------------------------------------------------------------

  /**
   * POST /api/v1/images/:imageId/analyze
   * Submits image to Groq multimodal model for disease/stress detection
   */
  apiRouter.post('/images/:imageId/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
    const image = db.getImageById(req.params.imageId);
    if (!image || image.owner_id !== req.user!.id) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }

    const plant = db.getPlantById(image.plant_id);
    if (!plant) {
      res.status(404).json({ error: 'Associated plant record not found.' });
      return;
    }

    // Create queued record
    const analysisId = `ai-ana-${Date.now()}`;
    const initialRecord: AIAnalysis = {
      id: analysisId,
      owner_id: req.user!.id,
      image_id: image.id,
      plant_id: plant.id,
      cycle_id: image.cycle_id,
      analysis_type: 'disease_and_stress',
      model_identifier: GROQ_VISION_MODEL,
      status: 'processing',
      created_at: new Date().toISOString(),
    };

  db.saveAIAnalysis(initialRecord);

  try {
    const latestReading = db.getReadings(plant.id, { limit: 20 });
    const getVal = (param: string) => latestReading.find((r) => r.parameter_name === param)?.value;

    const rasterCandidate =
      typeof req.body?.rasterized_data_url === 'string' &&
      /^data:image\/(png|jpeg|jpg|webp);base64,/.test(req.body.rasterized_data_url)
        ? req.body.rasterized_data_url
        : image.image_data_url;

    const analysisResult = await analyzePlantImage(rasterCandidate, plant.species, {
      temperature: getVal('temperature'),
      humidity: getVal('humidity'),
      soil_moisture: getVal('soil_moisture_average') ?? getVal('soil_moisture'),
      light_intensity: getVal('light_intensity'),
    });

    if (analysisResult.model_used) {
      initialRecord.model_identifier = analysisResult.model_used;
    }
    initialRecord.status = 'completed';
    initialRecord.result_json = analysisResult;
    initialRecord.completed_at = new Date().toISOString();

    db.saveAIAnalysis(initialRecord);

    broadcastEvent('ai_analysis_completed', { analysis: initialRecord });
    res.json({ analysis: initialRecord });
  } catch (err: unknown) {
    console.error('[FloraQ] AI Analysis failed:', err);
    initialRecord.status = 'failed';
    initialRecord.error_summary = err instanceof Error ? err.message : 'Unknown AI error';
    initialRecord.completed_at = new Date().toISOString();
    db.saveAIAnalysis(initialRecord);

    res.status(500).json({
      error: 'AI Analysis Failed',
      message: initialRecord.error_summary,
      analysis: initialRecord,
    });
  }
});

apiRouter.get('/images/:imageId/analysis', requireAuth, (req: AuthenticatedRequest, res) => {
  const analysis = db.getAnalysisByImageId(req.params.imageId);
  if (!analysis || analysis.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'No analysis found for this image.' });
    return;
  }
  res.json({ analysis });
});

apiRouter.get('/plants/:plantId/analyses', requireAuth, (req: AuthenticatedRequest, res) => {
  const analyses = db.getAnalysesByPlant(req.params.plantId);
  res.json({ analyses });
});

/**
 * POST /api/v1/images/generate-visualization
 * Generates clearly labeled "AI-generated visualization" of hypothetical future growth
 */
apiRouter.post('/images/generate-visualization', requireAuth, async (req: AuthenticatedRequest, res) => {
  const { plant_id, scenario_prompt, current_stage } = req.body;
  const plant = db.getPlantById(plant_id);
  if (!plant || plant.owner_id !== req.user!.id) {
    res.status(404).json({ error: 'Plant not found.' });
    return;
  }

  const promptText = scenario_prompt || 'Project canopy expansion after 14 days of low-stress training with 28C temperature target.';
  const stage = current_stage || 'Early vegetative expansion';

  try {
    const result = await generateGrowthScenarioVisualization(plant.species, promptText, stage);
    const vizId = `viz-${Date.now()}`;

    const vizRecord = {
      id: vizId,
      owner_id: req.user!.id,
      plant_id: plant.id,
      cycle_id: db.getCyclesByPlant(plant.id).find((c) => c.status === 'active')?.id || null,
      storage_key: `visualizations/${plant.id}/${vizId}.svg`,
      image_data_url: result.svg_data_url,
      prompt_description: promptText,
      model_identifier: result.model_used || GROQ_TEXT_MODEL,
      created_at: new Date().toISOString(),
      visualization_label: result.visualization_label,
      projected_parameters: result.projected_parameters,
      scenario_description: result.scenario_description,
    };

    db.saveVisualization(vizRecord);
    res.status(201).json({ visualization: vizRecord });
  } catch (err: unknown) {
    console.error('[FloraQ] Visualization generation error:', err);
    res.status(500).json({
      error: 'Generation Failed',
      message: err instanceof Error ? err.message : 'Unable to synthesize visualization.',
    });
  }
});

apiRouter.get('/ai/models', requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    const models = await listAvailableGroqModels();
    res.json({ provider: 'groq', models });
  } catch (err: unknown) {
    res.status(500).json({
      error: 'Groq Model Lookup Failed',
      message: err instanceof Error ? err.message : 'Unable to query Groq models.',
    });
  }
});

apiRouter.get('/plants/:plantId/visualizations', requireAuth, (req: AuthenticatedRequest, res) => {
  const list = db.getVisualizationsByPlant(req.params.plantId);
  res.json({ visualizations: list });
});
