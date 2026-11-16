import {
  IrrigationZoneHardware,
  PhytopodControlState,
  PhytopodTelemetrySnapshot,
  PhytopodZoneId,
  SensorHealthStatus,
} from '../types.js';

export const PHYTOPOD_SENSOR_PINS = [
  {
    sensor: 'DHT11 (Temperature & Humidity)',
    gpio: 'GPIO 4',
    bus: 'Single-Wire Digital',
    metrics: 'Temperature (°C), Humidity (%)',
  },
  {
    sensor: 'BH1750 (Ambient Light)',
    gpio: 'SDA GPIO 21 · SCL GPIO 22',
    bus: 'I2C (0x23)',
    metrics: 'Light Intensity (lux)',
  },
  {
    sensor: 'Soil Moisture Sensor 1',
    gpio: 'GPIO 34',
    bus: 'ADC1_CH6 (Analog)',
    metrics: 'Soil Moisture 1 (%)',
  },
  {
    sensor: 'Soil Moisture Sensor 2',
    gpio: 'GPIO 35',
    bus: 'ADC1_CH7 (Analog)',
    metrics: 'Soil Moisture 2 (%)',
  },
] as const;

export const PHYTOPOD_IRRIGATION_ZONES: IrrigationZoneHardware[] = [
  {
    id: 'zone1',
    zoneNumber: 1,
    label: 'Zone 1',
    gpio: 26,
    relayModule: 'Relay Module 1',
    relayInputs: 'IN1 + IN2',
    devices: 'Motor 1 + Solenoid Valve 1',
  },
  {
    id: 'zone2',
    zoneNumber: 2,
    label: 'Zone 2',
    gpio: 27,
    relayModule: 'Relay Module 1',
    relayInputs: 'IN3 + IN4',
    devices: 'Motor 2 + Solenoid Valve 2',
  },
  {
    id: 'zone3',
    zoneNumber: 3,
    label: 'Zone 3',
    gpio: 18,
    relayModule: 'Relay Module 2',
    relayInputs: 'IN1 + IN2',
    devices: 'Motor 3 + Solenoid Valve 3',
  },
  {
    id: 'zone4',
    zoneNumber: 4,
    label: 'Zone 4',
    gpio: 19,
    relayModule: 'Relay Module 2',
    relayInputs: 'IN3 + IN4',
    devices: 'Motor 4 + Solenoid Valve 4',
  },
];

export const DEFAULT_CONTROLS_STATE: PhytopodControlState = {
  zone1: false,
  zone2: false,
  zone3: false,
  zone4: false,
  grow_light: 'OFF',
  exhaust_fan: 'OFF',
  water_zone_1: 0,
  water_zone_2: 0,
  water_zone_3: 0,
  water_zone_4: 0,
};

export const TELEMETRY_STALE_MS = 120_000; // 2 minutes without update = stale

export function createEmptyTelemetrySnapshot(): PhytopodTelemetrySnapshot {
  return {
    temperature: null,
    humidity: null,
    light_intensity: null,
    soil_moisture_1: null,
    soil_moisture_2: null,
    soil_moisture_average: null,
    watering_enabled: false,
    watering_flag_present: false,
    zones: {
      zone1: { active: false, lockout: false },
      zone2: { active: false, lockout: false },
      zone3: { active: false, lockout: false },
      zone4: { active: false, lockout: false },
    },
    sensor_status: {
      temperature: 'missing',
      humidity: 'missing',
      light_intensity: 'missing',
      soil_moisture_1: 'missing',
      soil_moisture_2: 'missing',
      soil_moisture_average: 'missing',
    },
    sensor_errors: {},
    timestamp: null,
    received_at: null,
    esp32_last_seen: null,
    rpi_last_seen: null,
    source: 'none',
  };
}

/**
 * Parses a numeric sensor value strictly:
 * preserves 0 as valid, returns null for null/undefined/NaN/error strings.
 */
export function parseStrictSensorNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    return null;
  }
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

export function isTimestampStale(isoOrEpoch: string | number | null | undefined, thresholdMs = TELEMETRY_STALE_MS): boolean {
  if (isoOrEpoch === null || isoOrEpoch === undefined || isoOrEpoch === '') return true;
  const ms = typeof isoOrEpoch === 'number'
    ? (isoOrEpoch < 1e12 ? isoOrEpoch * 1000 : isoOrEpoch)
    : new Date(isoOrEpoch).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > thresholdMs;
}

export function normalizeTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    return new Date(ms).toISOString();
  }
  if (typeof raw === 'string') {
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(raw.trim())) {
      const ms = asNum < 1e12 ? asNum * 1000 : asNum;
      return new Date(ms).toISOString();
    }
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
}

/**
 * Normalizes arbitrary ESP32 / Firebase RTDB `/telemetry` payloads into a canonical snapshot.
 * Strictly separates missing readings, sensor errors, and stale telemetry from `0`.
 */
export function normalizeTelemetryPayload(
  raw: Record<string, unknown> | null | undefined,
  source: 'firebase_rtdb' | 'serial_bridge' = 'firebase_rtdb'
): PhytopodTelemetrySnapshot {
  if (!raw || typeof raw !== 'object') {
    return createEmptyTelemetrySnapshot();
  }

  const errorsObj: Record<string, string> = {};
  if (raw.sensor_errors && typeof raw.sensor_errors === 'object') {
    for (const [k, v] of Object.entries(raw.sensor_errors as Record<string, unknown>)) {
      if (v) errorsObj[k] = String(v);
    }
  }
  if (raw.errors && typeof raw.errors === 'object') {
    for (const [k, v] of Object.entries(raw.errors as Record<string, unknown>)) {
      if (v) errorsObj[k] = String(v);
    }
  }

  const climateObj = (raw.climate && typeof raw.climate === 'object' ? raw.climate : {}) as Record<string, unknown>;
  const soilObj = (raw.soil && typeof raw.soil === 'object' ? raw.soil : {}) as Record<string, unknown>;
  const lightObj = (raw.light && typeof raw.light === 'object' ? raw.light : {}) as Record<string, unknown>;
  const systemObj = (raw.system && typeof raw.system === 'object' ? raw.system : {}) as Record<string, unknown>;

  const temp = parseStrictSensorNumber(
    climateObj.temperature_c ?? climateObj.temperature ?? raw.temperature ?? raw.temp ?? raw.dht11_temp
  );
  const hum = parseStrictSensorNumber(
    climateObj.humidity_pct ?? climateObj.humidity ?? raw.humidity ?? raw.rh ?? raw.dht11_humidity
  );
  const light = parseStrictSensorNumber(
    lightObj.lux ?? lightObj.light_intensity ?? raw.light_intensity ?? raw.light ?? raw.lux ?? raw.bh1750_lux
  );
  const soil1 = parseStrictSensorNumber(
    soilObj.pot1_moisture_pct ??
      soilObj.moisture_1 ??
      soilObj.soil_moisture_1 ??
      raw.soil_moisture_1 ??
      raw.soil1 ??
      raw.moisture_1 ??
      raw.soil_1
  );
  const soil2 = parseStrictSensorNumber(
    soilObj.pot2_moisture_pct ??
      soilObj.moisture_2 ??
      soilObj.soil_moisture_2 ??
      raw.soil_moisture_2 ??
      raw.soil2 ??
      raw.moisture_2 ??
      raw.soil_2
  );

  let soilAvg = parseStrictSensorNumber(
    soilObj.avg_moisture_pct ??
      soilObj.moisture_pct ??
      raw.soil_moisture_average ??
      raw.soil_avg ??
      raw.average_soil_moisture
  );
  if (soilAvg === null) {
    if (soil1 !== null && soil2 !== null) {
      soilAvg = Number(((soil1 + soil2) / 2).toFixed(1));
    } else if (soil1 !== null) {
      soilAvg = soil1;
    } else if (soil2 !== null) {
      soilAvg = soil2;
    }
  }

  const ts = normalizeTimestamp(
    raw.timestamp ??
      climateObj.timestamp ??
      soilObj.timestamp ??
      lightObj.timestamp ??
      raw.updated_at ??
      raw.device_timestamp ??
      raw.last_seen
  );
  const stale = ts !== null ? isTimestampStale(ts) : false;

  const resolveStatus = (val: number | null, errKeys: string[]): SensorHealthStatus => {
    for (const key of errKeys) {
      if (errorsObj[key]) return 'error';
    }
    if (val === null) return 'missing';
    if (stale) return 'stale';
    return 'ok';
  };

  const zonesObj = (raw.zones && typeof raw.zones === 'object' ? raw.zones : {}) as Record<string, unknown>;
  const lockoutsObj = (raw.lockouts && typeof raw.lockouts === 'object' ? raw.lockouts : {}) as Record<string, unknown>;

  const parseZone = (zoneId: PhytopodZoneId) => {
    const direct = raw[zoneId];
    const nested = zonesObj[zoneId];
    const lockoutDirect = raw[`${zoneId}_lockout`] ?? lockoutsObj[zoneId];

    if (typeof direct === 'boolean') {
      return {
        active: direct,
        lockout: Boolean(lockoutDirect),
        lastUpdated: ts,
      };
    }
    const candidate = (nested && typeof nested === 'object' ? nested : direct && typeof direct === 'object' ? direct : {}) as Record<string, unknown>;
    return {
      active: Boolean(candidate.active ?? candidate.state ?? candidate.on ?? false),
      lockout: Boolean(candidate.lockout ?? candidate.locked ?? lockoutDirect ?? false),
      lastUpdated: normalizeTimestamp(candidate.last_updated ?? candidate.updated_at) ?? ts,
      error: candidate.error ? String(candidate.error) : null,
    };
  };

  const wateringEnabledRaw = raw.watering_enabled ?? raw.WATERING_ENABLED ?? systemObj.watering_enabled;
  const wateringFlagPresent = wateringEnabledRaw !== undefined && wateringEnabledRaw !== null;
  const wateringEnabled = wateringEnabledRaw === true || wateringEnabledRaw === 'true';

  return {
    temperature: temp,
    humidity: hum,
    light_intensity: light,
    soil_moisture_1: soil1,
    soil_moisture_2: soil2,
    soil_moisture_average: soilAvg,
    watering_enabled: wateringEnabled,
    watering_flag_present: wateringFlagPresent,
    zones: {
      zone1: parseZone('zone1'),
      zone2: parseZone('zone2'),
      zone3: parseZone('zone3'),
      zone4: parseZone('zone4'),
    },
    sensor_status: {
      temperature: resolveStatus(temp, ['temperature', 'dht11', 'dht11_temp']),
      humidity: resolveStatus(hum, ['humidity', 'dht11', 'dht11_humidity']),
      light_intensity: resolveStatus(light, ['light', 'light_intensity', 'bh1750']),
      soil_moisture_1: resolveStatus(soil1, ['soil_moisture_1', 'soil1']),
      soil_moisture_2: resolveStatus(soil2, ['soil_moisture_2', 'soil2']),
      soil_moisture_average: resolveStatus(soilAvg, ['soil_moisture_average', 'soil1', 'soil2']),
    },
    sensor_errors: errorsObj,
    timestamp: ts,
    received_at: new Date().toISOString(),
    esp32_last_seen: normalizeTimestamp(raw.esp32_last_seen) ?? ts,
    rpi_last_seen: normalizeTimestamp(raw.rpi_last_seen),
    source,
  };
}
