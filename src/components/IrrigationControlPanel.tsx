import React, { useState } from 'react';
import {
  Droplets,
  OctagonAlert,
  ShieldAlert,
  Power,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  X,
  Sun,
  Fan,
} from 'lucide-react';
import {
  PhytopodControlState,
  PhytopodTelemetrySnapshot,
  PhytopodZoneId,
  IrrigationZoneHardware,
} from '../types.js';
import { PHYTOPOD_IRRIGATION_ZONES } from '../lib/phytopod.js';
import {
  FirebaseConnectionState,
  writeDeviceCommand,
  writeWaterZoneCommand,
  emergencyStopZones,
} from '../lib/firebase.js';
import { api } from '../api.js';

interface IrrigationControlPanelProps {
  firebaseState: FirebaseConnectionState;
  telemetry: PhytopodTelemetrySnapshot;
  controls: PhytopodControlState;
  selectedPlantId?: string;
  onWateringLogged?: () => void;
}

export const IrrigationControlPanel: React.FC<IrrigationControlPanelProps> = ({
  firebaseState,
  telemetry,
  controls,
  selectedPlantId,
  onWateringLogged,
}) => {
  const [confirmZone, setConfirmZone] = useState<IrrigationZoneHardware | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [zoneDurations, setZoneDurations] = useState<Record<PhytopodZoneId, number>>({
    zone1: 8,
    zone2: 8,
    zone3: 8,
    zone4: 8,
  });
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  const firmwareExplicitlyDisabled =
    telemetry.watering_flag_present === true && telemetry.watering_enabled === false;
  const isFirebaseReady = firebaseState === 'connected';
  const anyZoneLockout = PHYTOPOD_IRRIGATION_ZONES.some((z) => telemetry.zones[z.id]?.lockout);

  const handleToggleDevice = async (device: 'grow_light' | 'exhaust_fan', state: 'ON' | 'OFF') => {
    setPendingTarget(device);
    setActionFeedback(null);
    try {
      await writeDeviceCommand(device, state);
      setActionFeedback({
        type: 'success',
        message: `Sent "${state}" to /commands/${device}.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Failed to update ${device}`,
      });
    } finally {
      setPendingTarget(null);
    }
  };

  const handleConfirmStartZone = async () => {
    if (!confirmZone) return;
    const zone = confirmZone;
    const duration = Math.max(1, Math.min(120, Number(zoneDurations[zone.id]) || 8));
    setConfirmZone(null);

    if (firmwareExplicitlyDisabled) {
      setActionFeedback({
        type: 'warning',
        message: `Blocked: Firmware WATERING_ENABLED = false. ${zone.label} (${zone.devices}) cannot be physically actuated.`,
      });
      return;
    }

    if (telemetry.zones[zone.id]?.lockout) {
      setActionFeedback({
        type: 'error',
        message: `Safety Lockout active on ${zone.label}. Clear firmware lockout before starting irrigation.`,
      });
      return;
    }

    setPendingTarget(zone.id);
    setActionFeedback(null);
    try {
      await writeWaterZoneCommand(zone.zoneNumber, duration);

      if (selectedPlantId) {
        await api
          .logWateringEvent({
            plant_id: selectedPlantId,
            zone: zone.id,
            duration_seconds: duration,
            source: 'firebase_rtdb',
            soil_moisture_before: telemetry.soil_moisture_average,
            status: 'command_sent',
            notes: `Timed command (${duration}s) written to /commands/water_zone_${zone.zoneNumber} (GPIO ${zone.gpio} · ${zone.devices})`,
          })
          .catch(() => {});
        onWateringLogged?.();
      }

      setActionFeedback({
        type: 'success',
        message: `Sent ${duration}s watering command to /commands/water_zone_${zone.zoneNumber} (${zone.devices}).`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Failed to command ${zone.label}`,
      });
    } finally {
      setPendingTarget(null);
    }
  };

  const handleStopSingleZone = async (zone: IrrigationZoneHardware) => {
    setPendingTarget(zone.id);
    setActionFeedback(null);
    try {
      await writeWaterZoneCommand(zone.zoneNumber, 0);

      if (selectedPlantId) {
        await api
          .logWateringEvent({
            plant_id: selectedPlantId,
            zone: zone.id,
            source: 'firebase_rtdb',
            soil_moisture_after: telemetry.soil_moisture_average,
            status: 'stopped',
            notes: `Stop command (0) written to /commands/water_zone_${zone.zoneNumber}`,
          })
          .catch(() => {});
        onWateringLogged?.();
      }

      setActionFeedback({
        type: 'success',
        message: `Sent 0 (STOP) to /commands/water_zone_${zone.zoneNumber}.`,
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : `Failed to stop ${zone.label}`,
      });
    } finally {
      setPendingTarget(null);
    }
  };

  const handleEmergencyStopAll = async () => {
    setPendingTarget('all');
    setActionFeedback(null);
    try {
      await emergencyStopZones();
      if (selectedPlantId) {
        await api
          .logWateringEvent({
            plant_id: selectedPlantId,
            zone: 'all_zones',
            source: 'firebase_rtdb',
            soil_moisture_before: telemetry.soil_moisture_average,
            soil_moisture_after: telemetry.soil_moisture_average,
            status: 'stopped',
            notes: 'EMERGENCY STOP triggered: wrote 0 to /commands/water_zone_1..4',
          })
          .catch(() => {});
        onWateringLogged?.();
      }
      setActionFeedback({
        type: 'warning',
        message: 'EMERGENCY STOP executed: /commands/water_zone_1..4 all set to 0.',
      });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Emergency Stop failed — check Firebase RTDB connection.',
      });
    } finally {
      setPendingTarget(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-[#E2EAE4] p-6 shadow-sm space-y-6">
      {/* Header & Emergency Stop */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#E2EAE4]">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#DCEFE2] text-[#174D36] shrink-0">
            <Droplets className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-[#174D36]">
                Chamber Devices & Four-Zone Irrigation Control
              </h3>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                  firmwareExplicitlyDisabled
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : telemetry.watering_enabled
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-[#DCEFE2] text-[#174D36] border-[#39805B]/30'
                }`}
              >
                {firmwareExplicitlyDisabled
                  ? 'WATERING_ENABLED = false (Locked)'
                  : telemetry.watering_enabled
                  ? 'WATERING_ENABLED = true (Armed)'
                  : 'Firebase /commands Active'}
              </span>
            </div>
            <p className="text-xs text-[#718078] mt-1">
              Controls Grow Light, Exhaust Fan, and four paired Motor + Solenoid Valve irrigation zones via{' '}
              <code className="px-1 py-0.5 rounded bg-[#F7FAF7] border border-[#E2EAE4] text-[#174D36] font-mono text-[11px]">
                /commands/*
              </code>
              .
            </p>
          </div>
        </div>

        <button
          onClick={handleEmergencyStopAll}
          disabled={!isFirebaseReady || pendingTarget === 'all'}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
          title="Immediately write 0 to /commands/water_zone_1..4"
        >
          <OctagonAlert className="w-4 h-4" />
          <span>{pendingTarget === 'all' ? 'Stopping All Zones...' : 'EMERGENCY STOP ALL ZONES'}</span>
        </button>
      </div>

      {/* Grow Light & Exhaust Fan Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Grow Light */}
        <div className="p-4 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                controls.grow_light === 'ON'
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-white text-[#718078] border-[#E2EAE4]'
              }`}
            >
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#174D36]">Grow Light</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                    controls.grow_light === 'ON'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-white text-[#718078] border-[#E2EAE4]'
                  }`}
                >
                  {controls.grow_light}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[#718078] mt-0.5">/commands/grow_light</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleDevice('grow_light', 'ON')}
              disabled={!isFirebaseReady || pendingTarget === 'grow_light'}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition disabled:opacity-45 ${
                controls.grow_light === 'ON'
                  ? 'bg-[#174D36] text-white shadow-sm'
                  : 'bg-white hover:bg-[#DCEFE2] text-[#174D36] border border-[#E2EAE4]'
              }`}
            >
              Turn ON
            </button>
            <button
              onClick={() => handleToggleDevice('grow_light', 'OFF')}
              disabled={!isFirebaseReady || pendingTarget === 'grow_light'}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition disabled:opacity-45 ${
                controls.grow_light === 'OFF'
                  ? 'bg-[#20352A] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-[#20352A] border border-[#E2EAE4]'
              }`}
            >
              Turn OFF
            </button>
          </div>
        </div>

        {/* Exhaust Fan */}
        <div className="p-4 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                controls.exhaust_fan === 'ON'
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                  : 'bg-white text-[#718078] border-[#E2EAE4]'
              }`}
            >
              <Fan className={`w-5 h-5 ${controls.exhaust_fan === 'ON' ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#174D36]">Exhaust Fan</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full border ${
                    controls.exhaust_fan === 'ON'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-white text-[#718078] border-[#E2EAE4]'
                  }`}
                >
                  {controls.exhaust_fan}
                </span>
              </div>
              <div className="text-[11px] font-mono text-[#718078] mt-0.5">/commands/exhaust_fan</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleDevice('exhaust_fan', 'ON')}
              disabled={!isFirebaseReady || pendingTarget === 'exhaust_fan'}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition disabled:opacity-45 ${
                controls.exhaust_fan === 'ON'
                  ? 'bg-[#174D36] text-white shadow-sm'
                  : 'bg-white hover:bg-[#DCEFE2] text-[#174D36] border border-[#E2EAE4]'
              }`}
            >
              Turn ON
            </button>
            <button
              onClick={() => handleToggleDevice('exhaust_fan', 'OFF')}
              disabled={!isFirebaseReady || pendingTarget === 'exhaust_fan'}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition disabled:opacity-45 ${
                controls.exhaust_fan === 'OFF'
                  ? 'bg-[#20352A] text-white shadow-sm'
                  : 'bg-white hover:bg-gray-100 text-[#20352A] border border-[#E2EAE4]'
              }`}
            >
              Turn OFF
            </button>
          </div>
        </div>
      </div>

      {/* Firmware Watering Disabled Banner */}
      {firmwareExplicitlyDisabled && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
          <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Watering Disabled in ESP32 Firmware (WATERING_ENABLED = false): </strong>
            <span>
              Physical pump and solenoid valve actuation is locked out at the controller firmware level. Zone watering buttons are disabled until firmware reports watering_enabled = true.
            </span>
          </div>
        </div>
      )}

      {/* Safety Lockout Warning Banner */}
      {anyZoneLockout && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold">Safety Lockout Triggered: </strong>
            <span>
              One or more irrigation zones entered controller safety lockout. Inspect hardware and reset the ESP32 lockout state before re-enabling.
            </span>
          </div>
        </div>
      )}

      {/* Firebase Unconfigured / Disconnected Banner */}
      {!isFirebaseReady && (
        <div className="p-3.5 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] text-xs text-[#20352A] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-semibold">Firebase RTDB Command Path Unavailable ({firebaseState}): </strong>
            <span>
              Waiting for live connection to Firebase Realtime Database before sending /commands/*.
            </span>
          </div>
        </div>
      )}

      {/* Action Feedback */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionFeedback.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{actionFeedback.message}</span>
        </div>
      )}

      {/* 4 Irrigation Zone Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PHYTOPOD_IRRIGATION_ZONES.map((zone) => {
          const reported = telemetry.zones[zone.id] || { active: false, lockout: false };
          const commandKey = `water_zone_${zone.zoneNumber}` as
            | 'water_zone_1'
            | 'water_zone_2'
            | 'water_zone_3'
            | 'water_zone_4';
          const queuedDuration = controls[commandKey] || 0;
          const isLockedOut = reported.lockout === true;
          const isBusy = pendingTarget === zone.id || pendingTarget === 'all';
          const canStart = isFirebaseReady && !firmwareExplicitlyDisabled && !isLockedOut && !isBusy;
          const durationInput = zoneDurations[zone.id] ?? 8;

          return (
            <div
              key={zone.id}
              className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 transition ${
                isLockedOut
                  ? 'bg-rose-50/40 border-rose-300'
                  : reported.active || queuedDuration > 0
                  ? 'bg-emerald-50/50 border-emerald-300 shadow-xs'
                  : 'bg-[#F7FAF7] border-[#E2EAE4]'
              }`}
            >
              <div className="space-y-2">
                {/* Zone Header */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-[#174D36]">{zone.label}</span>
                  {isLockedOut ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                      Lockout
                    </span>
                  ) : reported.active || queuedDuration > 0 ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">
                      {queuedDuration > 0 ? `${queuedDuration}s Cmd` : 'Active'}
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-white text-[#718078] border border-[#E2EAE4]">
                      Idle
                    </span>
                  )}
                </div>

                {/* Paired Hardware Description */}
                <div className="p-2.5 rounded-lg bg-white border border-[#E2EAE4] space-y-1 text-[11px]">
                  <div className="font-semibold text-[#20352A]">{zone.devices}</div>
                  <div className="text-[#718078] flex items-center justify-between font-mono text-[10px]">
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-[#39805B]" />
                      GPIO {zone.gpio}
                    </span>
                    <span>
                      {zone.relayModule.replace('Relay ', '')} ({zone.relayInputs})
                    </span>
                  </div>
                </div>

                {/* RTDB Command Path & Duration Picker */}
                <div className="text-[11px] space-y-1.5 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[#718078] font-mono text-[10px]">/commands/{commandKey}:</span>
                    <span className={`font-mono font-bold ${queuedDuration > 0 ? 'text-emerald-700' : 'text-[#20352A]'}`}>
                      {queuedDuration} s
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[#718078]">Duration (sec):</label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={durationInput}
                      onChange={(e) =>
                        setZoneDurations((prev) => ({
                          ...prev,
                          [zone.id]: Math.max(1, Math.min(120, Number(e.target.value) || 8)),
                        }))
                      }
                      className="w-16 px-2 py-0.5 rounded border border-[#E2EAE4] bg-white text-right font-mono font-bold text-[#174D36]"
                    />
                  </div>
                </div>
              </div>

              {/* Paired Timed Control Action */}
              <div className="pt-2 border-t border-[#E2EAE4] space-y-1.5">
                <button
                  onClick={() => setConfirmZone(zone)}
                  disabled={!canStart}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold transition disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  <Droplets className="w-3.5 h-3.5" />
                  <span>
                    {firmwareExplicitlyDisabled
                      ? 'Firmware Disabled'
                      : isLockedOut
                      ? 'Locked Out'
                      : `Water ${zone.label} (${durationInput}s)`}
                  </span>
                </button>

                {(reported.active || queuedDuration > 0) && (
                  <button
                    onClick={() => handleStopSingleZone(zone)}
                    disabled={!isFirebaseReady || isBusy}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition disabled:opacity-45"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>{isBusy ? 'Sending...' : `Stop ${zone.label} (0)`}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialog before starting irrigation */}
      {confirmZone && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
              <h3 className="text-base font-bold text-[#174D36] flex items-center gap-2">
                <Droplets className="w-5 h-5 text-[#39805B]" />
                Confirm Timed Irrigation Command
              </h3>
              <button
                onClick={() => setConfirmZone(null)}
                className="text-[#718078] hover:text-[#20352A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#20352A]">
              <p>
                You are about to activate <strong>{confirmZone.label}</strong> by writing{' '}
                <code className="px-1 py-0.5 rounded bg-[#F7FAF7] border border-[#E2EAE4] font-mono font-bold">
                  {zoneDurations[confirmZone.id] ?? 8}
                </code>{' '}
                (seconds) to{' '}
                <code className="px-1 py-0.5 rounded bg-[#F7FAF7] border border-[#E2EAE4] font-mono">
                  /commands/water_zone_{confirmZone.zoneNumber}
                </code>
                .
              </p>

              <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#718078]">Paired Actuators:</span>
                  <span className="font-bold text-[#174D36]">{confirmZone.devices}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718078]">Controller Pin:</span>
                  <span className="font-mono font-semibold">GPIO {confirmZone.gpio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718078]">Relay Channels:</span>
                  <span className="font-mono">
                    {confirmZone.relayModule} ({confirmZone.relayInputs})
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[#718078]">
                Motor and solenoid valve actuate together as a paired circuit. Monitor soil moisture and use Emergency Stop if overflow occurs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
              <button
                type="button"
                onClick={() => setConfirmZone(null)}
                className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStartZone}
                className="px-4 py-1.5 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-semibold"
              >
                Send {zoneDurations[confirmZone.id] ?? 8}s Command to {confirmZone.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
