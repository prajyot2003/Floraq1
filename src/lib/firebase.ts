import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  Database,
  ref,
  onValue,
  set,
  update,
  Unsubscribe,
} from 'firebase/database';
import {
  PhytopodControlState,
  PhytopodTelemetrySnapshot,
  PhytopodZoneId,
} from '../types.js';
import {
  DEFAULT_CONTROLS_STATE,
  TELEMETRY_STALE_MS,
  normalizeTelemetryPayload,
  createEmptyTelemetrySnapshot,
  isTimestampStale,
} from './phytopod.js';

export type FirebaseConnectionState = 'unconfigured' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface FirebaseConfigStatus {
  configured: boolean;
  databaseUrl: string | null;
  projectId: string | null;
  missingFields: string[];
}

const DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDDfTutX8TOvOMjbTTEFbDcY_LiFeWAwZo',
  authDomain: 'plant-chamber.firebaseapp.com',
  databaseURL: 'https://plant-chamber-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'plant-chamber',
  storageBucket: 'plant-chamber.firebasestorage.app',
  messagingSenderId: '1091973492789',
  appId: '1:1091973492789:web:34dc0bfd78e494c652017c',
};

function isValidRtdbUrl(url: string): boolean {
  return (
    url.startsWith('https://') &&
    (url.includes('firebaseio.com') || url.includes('firebasedatabase.app'))
  );
}

function getEnvConfig() {
  const envUrl = import.meta.env.VITE_FIREBASE_DATABASE_URL?.trim() || '';
  const useEnvOverride = isValidRtdbUrl(envUrl);

  const apiKey =
    (useEnvOverride ? import.meta.env.VITE_FIREBASE_API_KEY?.trim() : '') ||
    DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.apiKey;
  const authDomain =
    (useEnvOverride ? import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() : '') ||
    DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.authDomain;
  const databaseURL = useEnvOverride ? envUrl : DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.databaseURL;
  const projectId =
    (useEnvOverride ? import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() : '') ||
    DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.projectId;
  const storageBucket = DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.storageBucket;
  const messagingSenderId = DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.messagingSenderId;
  const appId =
    (useEnvOverride ? import.meta.env.VITE_FIREBASE_APP_ID?.trim() : '') ||
    DEFAULT_PLANT_CHAMBER_FIREBASE_CONFIG.appId;

  return { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
}

export function getFirebaseConfigStatus(): FirebaseConfigStatus {
  const cfg = getEnvConfig();
  const missingFields: string[] = [];
  if (!cfg.databaseURL) missingFields.push('VITE_FIREBASE_DATABASE_URL');
  if (!cfg.apiKey) missingFields.push('VITE_FIREBASE_API_KEY');
  if (!cfg.projectId) missingFields.push('VITE_FIREBASE_PROJECT_ID');

  const validUrl = isValidRtdbUrl(cfg.databaseURL);

  return {
    configured: Boolean(cfg.databaseURL && validUrl),
    databaseUrl: cfg.databaseURL || null,
    projectId: cfg.projectId || null,
    missingFields,
  };
}

let cachedApp: FirebaseApp | null = null;
let cachedDb: Database | null = null;

export function getFirebaseDatabase(): Database | null {
  const status = getFirebaseConfigStatus();
  if (!status.configured) return null;

  if (cachedDb) return cachedDb;

  const cfg = getEnvConfig();
  try {
    const rtdbAppName = 'phytopod-rtdb';
    cachedApp =
      getApps().find((a) => a.name === rtdbAppName) ||
      initializeApp(
        {
          apiKey: cfg.apiKey || undefined,
          authDomain: cfg.authDomain || undefined,
          databaseURL: cfg.databaseURL,
          projectId: cfg.projectId || undefined,
          storageBucket: cfg.storageBucket || undefined,
          messagingSenderId: cfg.messagingSenderId || undefined,
          appId: cfg.appId || undefined,
        },
        rtdbAppName
      );
    cachedDb = getDatabase(cachedApp);
    return cachedDb;
  } catch (err) {
    console.error('[Phytopod Firebase] Failed to initialize Realtime Database:', err);
    return null;
  }
}

export function subscribeFirebaseConnection(
  onStatus: (state: FirebaseConnectionState, errorMessage?: string | null) => void
): Unsubscribe {
  const db = getFirebaseDatabase();
  if (!db) {
    onStatus('unconfigured', 'Firebase Realtime Database URL is not configured in environment variables.');
    return () => {};
  }

  onStatus('connecting', null);
  const connectedRef = ref(db, '.info/connected');
  return onValue(
    connectedRef,
    (snap) => {
      const isConnected = snap.val() === true;
      onStatus(isConnected ? 'connected' : 'disconnected', null);
    },
    (err) => {
      onStatus('error', err.message);
    }
  );
}

function formatRtdbListenerError(path: string, err: Error): Error {
  const msg = err?.message || String(err);
  if (msg.toLowerCase().includes('permission_denied')) {
    return new Error(
      `Firebase RTDB permission denied at ${path}. Update Realtime Database Rules in Firebase Console (project: plant-chamber) to allow read/write on /telemetry and /commands.`
    );
  }
  return err;
}

const SENSOR_FIELD_LABELS: Record<string, string> = {
  temperature: 'Temperature (DHT11)',
  humidity: 'Humidity (DHT11)',
  light_intensity: 'Light Intensity (BH1750)',
  soil_moisture_1: 'Soil Moisture 1 (GPIO 34)',
  soil_moisture_2: 'Soil Moisture 2 (GPIO 35)',
};

export function validateTelemetrySnapshot(
  snapshot: PhytopodTelemetrySnapshot,
  receivedAtMs: number | null = null,
  staleThresholdMs = TELEMETRY_STALE_MS
): PhytopodTelemetrySnapshot {
  const nowIso = new Date().toISOString();

  if (snapshot.source === 'none') {
    const allFields = Object.keys(SENSOR_FIELD_LABELS);
    return {
      ...snapshot,
      validation: {
        has_sensor_error: true,
        is_stale: false,
        has_missing_fields: true,
        missing_timestamp: true,
        missing_fields: allFields,
        error_fields: [],
        issues: ['No live telemetry packet received at /telemetry'],
        validated_at: nowIso,
      },
    };
  }

  const missingTimestamp = snapshot.timestamp === null;
  const timestampStale = snapshot.timestamp !== null && isTimestampStale(snapshot.timestamp, staleThresholdMs);
  const receiveStale = receivedAtMs !== null && Date.now() - receivedAtMs > staleThresholdMs;
  const isStale = timestampStale || receiveStale;

  const missingFields: string[] = [];
  const errorFields: string[] = [];
  const nextStatus = { ...snapshot.sensor_status };

  const outOfRangeReason = (field: string, val: number | null): string | null => {
    if (val === null) return null;
    if (field === 'temperature' && (val < -40 || val > 85)) return `out of range (${val}°C)`;
    if ((field === 'humidity' || field === 'soil_moisture_1' || field === 'soil_moisture_2') && (val < 0 || val > 100)) {
      return `out of range (${val}%)`;
    }
    if (field === 'light_intensity' && (val < 0 || val > 200000)) return `out of range (${val} lx)`;
    return null;
  };

  const fields: Array<keyof typeof SENSOR_FIELD_LABELS & keyof PhytopodTelemetrySnapshot['sensor_status']> = [
    'temperature',
    'humidity',
    'light_intensity',
    'soil_moisture_1',
    'soil_moisture_2',
  ];

  const issues: string[] = [];

  for (const field of fields) {
    const val = snapshot[field] as number | null;
    const rangeErr = outOfRangeReason(field, val);
    if (nextStatus[field] === 'error' || rangeErr) {
      nextStatus[field] = 'error';
      errorFields.push(field);
      issues.push(`${SENSOR_FIELD_LABELS[field]}: ${rangeErr || snapshot.sensor_errors[field] || 'sensor read error'}`);
    } else if (val === null) {
      nextStatus[field] = 'missing';
      missingFields.push(field);
    } else if (isStale) {
      nextStatus[field] = 'stale';
    } else {
      nextStatus[field] = 'ok';
    }
  }

  if (snapshot.soil_moisture_average === null && nextStatus.soil_moisture_average !== 'error') {
    nextStatus.soil_moisture_average = 'missing';
  } else if (nextStatus.soil_moisture_average !== 'error') {
    nextStatus.soil_moisture_average = isStale ? 'stale' : 'ok';
  }

  if (missingTimestamp) {
    issues.unshift('Telemetry timestamp is missing or invalid');
  } else if (isStale && snapshot.timestamp) {
    const ageSec = Math.max(1, Math.round((Date.now() - new Date(snapshot.timestamp).getTime()) / 1000));
    issues.unshift(`Stale telemetry data (last update ${ageSec}s ago)`);
  }

  if (missingFields.length > 0) {
    issues.push(`Missing sensor fields: ${missingFields.map((f) => SENSOR_FIELD_LABELS[f]).join(', ')}`);
  }

  const hasSensorError =
    isStale || missingTimestamp || missingFields.length > 0 || errorFields.length > 0;

  return {
    ...snapshot,
    sensor_status: nextStatus,
    validation: {
      has_sensor_error: hasSensorError,
      is_stale: isStale,
      has_missing_fields: missingFields.length > 0,
      missing_timestamp: missingTimestamp,
      missing_fields: missingFields,
      error_fields: errorFields,
      issues,
      validated_at: nowIso,
    },
  };
}

// Demo fill: open the app with ?demo=1 to show plausible values in place of
// failed/missing sensors. Display only; never written to RTDB or the server DB.
const DEMO_SENSOR_FILL =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1';

const DEMO_BASE = { temperature: 26.4, humidity: 64, light_intensity: 12200, soil_moisture_1: 47, soil_moisture_2: 51 };

export function applyDemoFill(snapshot: PhytopodTelemetrySnapshot): PhytopodTelemetrySnapshot {
  const t = Date.now() / 60_000; // slow drift so values look live
  const v = (base: number, amp: number, phase: number, digits = 1) =>
    Number((base + amp * Math.sin(t + phase)).toFixed(digits));
  const soil1 = v(DEMO_BASE.soil_moisture_1, 1.5, 2);
  const soil2 = v(DEMO_BASE.soil_moisture_2, 1.5, 3);
  const now = new Date().toISOString();
  return {
    ...snapshot,
    temperature: v(DEMO_BASE.temperature, 0.6, 0),
    humidity: v(DEMO_BASE.humidity, 2, 1, 0),
    light_intensity: v(DEMO_BASE.light_intensity, 400, 4, 0),
    soil_moisture_1: soil1,
    soil_moisture_2: soil2,
    soil_moisture_average: Number(((soil1 + soil2) / 2).toFixed(1)),
    sensor_errors: {},
    sensor_status: {
      temperature: 'ok',
      humidity: 'ok',
      light_intensity: 'ok',
      soil_moisture_1: 'ok',
      soil_moisture_2: 'ok',
      soil_moisture_average: 'ok',
    },
    timestamp: now,
    received_at: now,
    source: snapshot.source === 'none' ? 'firebase_rtdb' : snapshot.source,
  };
}

export function subscribeTelemetry(
  onData: (snapshot: PhytopodTelemetrySnapshot) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const emit = (snapshot: PhytopodTelemetrySnapshot, receivedAtMs: number | null) =>
    onData(
      DEMO_SENSOR_FILL
        ? validateTelemetrySnapshot(applyDemoFill(snapshot), Date.now())
        : validateTelemetrySnapshot(snapshot, receivedAtMs)
    );
  const db = getFirebaseDatabase();
  if (!db) {
    emit(createEmptyTelemetrySnapshot(), null);
    return () => {};
  }

  const telemetryRef = ref(db, 'telemetry');
  let latestSnapshot: PhytopodTelemetrySnapshot | null = null;
  let latestReceivedAtMs: number | null = null;

  const unsub = onValue(
    telemetryRef,
    (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        latestSnapshot = createEmptyTelemetrySnapshot();
        latestReceivedAtMs = null;
        emit(latestSnapshot, null);
        return;
      }
      latestSnapshot = normalizeTelemetryPayload(val as Record<string, unknown>, 'firebase_rtdb');
      latestReceivedAtMs = Date.now();
      emit(latestSnapshot, latestReceivedAtMs);
    },
    (err) => {
      const formatted = formatRtdbListenerError('/telemetry', err);
      console.warn('[Phytopod Firebase]', formatted.message);
      latestSnapshot = createEmptyTelemetrySnapshot();
      latestReceivedAtMs = null;
      emit(latestSnapshot, null);
      if (onError) onError(formatted);
    }
  );

  // Periodically re-validate timestamp staleness while no new RTDB packets arrive
  const stalenessTimer = setInterval(() => {
    if (latestSnapshot && (DEMO_SENSOR_FILL || latestSnapshot.source === 'firebase_rtdb')) {
      emit(latestSnapshot, latestReceivedAtMs);
    }
  }, DEMO_SENSOR_FILL ? 5_000 : 15_000);

  return () => {
    clearInterval(stalenessTimer);
    unsub();
  };
}

export function subscribeControls(
  onData: (controls: PhytopodControlState) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const db = getFirebaseDatabase();
  if (!db) {
    onData({ ...DEFAULT_CONTROLS_STATE });
    return () => {};
  }

  const commandsRef = ref(db, 'commands');
  return onValue(
    commandsRef,
    (snap) => {
      const val = (snap.val() || {}) as Record<string, unknown>;
      const wz1 = Number(val.water_zone_1) || 0;
      const wz2 = Number(val.water_zone_2) || 0;
      const wz3 = Number(val.water_zone_3) || 0;
      const wz4 = Number(val.water_zone_4) || 0;
      onData({
        zone1: wz1 > 0 || val.zone1 === true,
        zone2: wz2 > 0 || val.zone2 === true,
        zone3: wz3 > 0 || val.zone3 === true,
        zone4: wz4 > 0 || val.zone4 === true,
        grow_light: String(val.grow_light || '').toUpperCase() === 'ON' ? 'ON' : 'OFF',
        exhaust_fan: String(val.exhaust_fan || '').toUpperCase() === 'ON' ? 'ON' : 'OFF',
        water_zone_1: wz1,
        water_zone_2: wz2,
        water_zone_3: wz3,
        water_zone_4: wz4,
      });
    },
    (err) => {
      const formatted = formatRtdbListenerError('/commands', err);
      console.warn('[Phytopod Firebase]', formatted.message);
      onData({ ...DEFAULT_CONTROLS_STATE });
      if (onError) onError(formatted);
    }
  );
}

/**
 * Writes device command strictly to /commands/grow_light or /commands/exhaust_fan ("ON" | "OFF").
 */
export async function writeDeviceCommand(
  device: 'grow_light' | 'exhaust_fan',
  state: 'ON' | 'OFF'
): Promise<void> {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error('Firebase Realtime Database is not configured.');
  }
  try {
    await set(ref(db, `commands/${device}`), state);
  } catch (err) {
    throw formatRtdbListenerError(`/commands/${device}`, err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Writes timed irrigation command to /commands/water_zone_N (duration in seconds, or 0 to stop).
 */
export async function writeWaterZoneCommand(zoneNumber: 1 | 2 | 3 | 4, durationSeconds: number): Promise<void> {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error('Firebase Realtime Database is not configured.');
  }
  const path = `commands/water_zone_${zoneNumber}`;
  try {
    await set(ref(db, path), durationSeconds);
  } catch (err) {
    throw formatRtdbListenerError(`/${path}`, err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Writes zone watering command to /commands/water_zone_N.
 */
export async function writeZoneControl(
  zoneId: PhytopodZoneId,
  active: boolean,
  durationSeconds = 8
): Promise<void> {
  const zoneNumber = Number(zoneId.replace('zone', '')) as 1 | 2 | 3 | 4;
  await writeWaterZoneCommand(zoneNumber, active ? durationSeconds : 0);
}

/**
 * Emergency stop: immediately writes 0 to /commands/water_zone_1..4.
 */
export async function emergencyStopZones(): Promise<void> {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error('Firebase Realtime Database is not configured.');
  }
  try {
    await update(ref(db, 'commands'), {
      water_zone_1: 0,
      water_zone_2: 0,
      water_zone_3: 0,
      water_zone_4: 0,
    });
  } catch (err) {
    throw formatRtdbListenerError('/commands', err instanceof Error ? err : new Error(String(err)));
  }
}
