import React, { useState } from 'react';
import {
  X,
  Sprout,
  GitBranch,
  Droplets,
  FlaskConical,
  Thermometer,
  Sun,
  Scale,
  User,
  Lock,
  Phone,
  Sparkles,
  Key,
  Cloud,
  CheckCircle2,
} from 'lucide-react';
import { User as FirebaseUser } from 'firebase/auth';
import { Plant, UserProfile } from '../types.js';
import { api } from '../api.js';
import {
  signInWithGoogle,
  signOutFirebase,
  savePlantToFirestore,
  saveCycleToFirestore,
  saveObservationToFirestore,
  saveCareEventToFirestore,
  syncLocalPlantsToFirestore,
  getFirebaseProjectInfo,
} from '../lib/firestore.js';

// --- 1. ADD PLANT MODAL ---
interface AddPlantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPlantModal: React.FC<AddPlantModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [planName, setPlanName] = useState('');
  const [plantName, setPlantName] = useState('');
  const [species, setSpecies] = useState('');
  const [plantingDate, setPlantingDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName || !plantName || !species) return;
    setIsSubmitting(true);
    try {
      const res = await api.createPlant({
        plan_name: planName,
        plant_name: plantName,
        species,
        planting_date: plantingDate,
        notes,
      });
      if (res?.plant) {
        await savePlantToFirestore(res.plant);
        if (res.cycle) {
          await saveCycleToFirestore(res.plant, res.cycle);
        }
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error creating plant: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36] flex items-center gap-2">
            <Sprout className="w-5 h-5 text-[#39805B]" />
            Add Dynamic Plant Plan
          </h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Plan Identifier & Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Plan 4 — Lavender"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Botanical Plant Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. English Lavender (Munstead)"
              value={plantName}
              onChange={(e) => setPlantName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Scientific Species *</label>
            <input
              type="text"
              required
              placeholder="e.g. Lavandula angustifolia"
              value={species}
              onChange={(e) => setSpecies(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Planting Date</label>
            <input
              type="date"
              value={plantingDate}
              onChange={(e) => setPlantingDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Experiment Hypothesis & Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Specific growth parameters to evaluate..."
              className="w-full p-2.5 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Creating...' : 'Initialize Plant Plan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 2. NEW CYCLE MODAL ---
interface NewCycleModalProps {
  isOpen: boolean;
  plantId: string;
  plant?: Plant;
  onClose: () => void;
  onSuccess: () => void;
}

export const NewCycleModal: React.FC<NewCycleModalProps> = ({ isOpen, plantId, plant, onClose, onSuccess }) => {
  const [cycleName, setCycleName] = useState('');
  const [objective, setObjective] = useState('');
  const [targetTemp, setTargetTemp] = useState(28.0);
  const [targetHum, setTargetHum] = useState(70.0);
  const [targetMoist, setTargetMoist] = useState(55.0);
  const [targetLight, setTargetLight] = useState(12000);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cycleName) return;
    setIsSubmitting(true);
    try {
      const res = await api.createCycle(plantId, {
        cycle_name: cycleName,
        objective,
        initial_targets: {
          temperature: targetTemp,
          humidity: targetHum,
          soil_moisture: targetMoist,
          light_intensity: targetLight,
        },
        notes,
      });
      if (plant && res?.cycle) {
        await saveCycleToFirestore(plant, res.cycle);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error creating cycle: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36] flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#39805B]" />
            Create Next Growth Cycle
          </h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-[#718078]">
          Starting a new cycle automatically completes the current cycle and preserves its historical telemetry untouched.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Cycle Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. Cycle 3: Advanced Fertigation & Light Ramp"
              value={cycleName}
              onChange={(e) => setCycleName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Experimental Objective</label>
            <input
              type="text"
              placeholder="Hypothesis to test in this cycle"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] focus:ring-2 focus:ring-[#39805B]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Target Temp (°C)</label>
              <input
                type="number"
                step="0.5"
                value={targetTemp}
                onChange={(e) => setTargetTemp(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Target Humidity (%)</label>
              <input
                type="number"
                step="1"
                value={targetHum}
                onChange={(e) => setTargetHum(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Target Moisture (%)</label>
              <input
                type="number"
                step="1"
                value={targetMoist}
                onChange={(e) => setTargetMoist(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Target Light (lux)</label>
              <input
                type="number"
                step="500"
                value={targetLight}
                onChange={(e) => setTargetLight(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Saving...' : 'Start Cycle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 3. DAILY OBSERVATION MODAL ---
interface LogObservationModalProps {
  isOpen: boolean;
  plantId: string;
  plant?: Plant;
  onClose: () => void;
  onSuccess: () => void;
}

export const LogObservationModal: React.FC<LogObservationModalProps> = ({
  isOpen,
  plantId,
  plant,
  onClose,
  onSuccess,
}) => {
  const [height, setHeight] = useState(41.0);
  const [soilPh, setSoilPh] = useState(6.5);
  const [healthObs, setHealthObs] = useState('Vigorous apical shoot elongation. Excellent leaf turgor.');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.createObservation(plantId, {
        plant_height: height,
        soil_ph: soilPh,
        health_observations: healthObs,
        notes,
      });
      if (plant && res?.observation) {
        await saveObservationToFirestore(plant, res.observation);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error saving observation: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36] flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#39805B]" />
            Log Manual Observation
          </h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Measured Plant Height (cm)</label>
              <input
                type="number"
                step="0.1"
                required
                value={height}
                onChange={(e) => setHeight(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Soil pH</label>
              <input
                type="number"
                step="0.1"
                value={soilPh}
                onChange={(e) => setSoilPh(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Foliar Observations *</label>
            <textarea
              rows={3}
              required
              value={healthObs}
              onChange={(e) => setHealthObs(e.target.value)}
              placeholder="Leaf turgor, coloration, nodulation..."
              className="w-full p-2.5 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] resize-none"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Experiment Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional remarks..."
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Saving...' : 'Save Observation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 4. RECORD CARE EVENT MODAL ---
interface RecordCareModalProps {
  isOpen: boolean;
  plantId: string;
  plant?: Plant;
  onClose: () => void;
  onSuccess: () => void;
}

export const RecordCareModal: React.FC<RecordCareModalProps> = ({
  isOpen,
  plantId,
  plant,
  onClose,
  onSuccess,
}) => {
  const [eventType, setEventType] = useState<'watering' | 'fertilizer' | 'training' | 'pruning'>('watering');
  const [zone, setZone] = useState<'zone1' | 'zone2' | 'zone3' | 'zone4' | 'manual'>('zone1');
  const [durationSeconds, setDurationSeconds] = useState<string>('');
  const [soilBefore, setSoilBefore] = useState<string>('');
  const [soilAfter, setSoilAfter] = useState<string>('');
  const [quantity, setQuantity] = useState(250);
  const [unit, setUnit] = useState('mL');
  const [method, setMethod] = useState('Zone 1 Relay (Motor 1 + Valve 1)');
  const [productName, setProductName] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await api.createCareEvent(plantId, {
        event_type: eventType,
        zone: eventType === 'watering' ? zone : undefined,
        duration_seconds:
          eventType === 'watering' && durationSeconds !== '' ? Number(durationSeconds) : undefined,
        soil_moisture_before:
          eventType === 'watering' && soilBefore !== '' ? Number(soilBefore) : undefined,
        soil_moisture_after:
          eventType === 'watering' && soilAfter !== '' ? Number(soilAfter) : undefined,
        quantity: eventType === 'fertilizer' ? quantity : undefined,
        unit: eventType === 'fertilizer' ? unit : undefined,
        method,
        product_name: productName || undefined,
        status: 'logged',
        notes,
      });
      if (plant && res?.care_event) {
        await saveCareEventToFirestore(plant, res.care_event);
      }
      onSuccess();
      onClose();
    } catch (err) {
      alert('Error saving care event: ' + (err instanceof Error ? err.message : 'Error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36] flex items-center gap-2">
            <Droplets className="w-5 h-5 text-blue-500" />
            Record Care / Treatment Event
          </h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Event Category</label>
            <select
              value={eventType}
              onChange={(e) => {
                const val = e.target.value as 'watering' | 'fertilizer' | 'training' | 'pruning';
                setEventType(val);
                if (val === 'fertilizer') {
                  setUnit('mL');
                  setMethod('Sub-canopy fertigation');
                } else if (val === 'watering') {
                  setMethod('Zone 1 Relay (Motor 1 + Valve 1)');
                } else {
                  setMethod('Manual canopy intervention');
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            >
              <option value="watering">Watering / Irrigation</option>
              <option value="fertilizer">Fertilizer Application</option>
              <option value="training">Low Stress Training (LST)</option>
              <option value="pruning">Canopy Pruning / Defoliation</option>
            </select>
          </div>

          {eventType === 'watering' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Irrigation Zone</label>
                  <select
                    value={zone}
                    onChange={(e) => {
                      const z = e.target.value as 'zone1' | 'zone2' | 'zone3' | 'zone4' | 'manual';
                      setZone(z);
                      const map: Record<string, string> = {
                        zone1: 'Zone 1 (GPIO 26 · Motor 1 + Valve 1)',
                        zone2: 'Zone 2 (GPIO 27 · Motor 2 + Valve 2)',
                        zone3: 'Zone 3 (GPIO 18 · Motor 3 + Valve 3)',
                        zone4: 'Zone 4 (GPIO 19 · Motor 4 + Valve 4)',
                        manual: 'Manual watering can',
                      };
                      setMethod(map[z]);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  >
                    <option value="zone1">Zone 1 (GPIO 26)</option>
                    <option value="zone2">Zone 2 (GPIO 27)</option>
                    <option value="zone3">Zone 3 (GPIO 18)</option>
                    <option value="zone4">Zone 4 (GPIO 19)</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Duration (seconds)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Optional"
                    value={durationSeconds}
                    onChange={(e) => setDurationSeconds(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Soil Before (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Optional"
                    value={soilBefore}
                    onChange={(e) => setSoilBefore(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Soil After (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Optional"
                    value={soilAfter}
                    onChange={(e) => setSoilAfter(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  />
                </div>
              </div>
            </>
          )}

          {eventType === 'fertilizer' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Volume / Quantity</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#20352A] block mb-1">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-[#20352A] block mb-1">Nutrient Product Name</label>
                <input
                  type="text"
                  placeholder="e.g. FloraNova Bloom (4-8-7)"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
                />
              </div>
            </>
          )}

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Application Method</label>
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g. Zone 1 Relay or Manual"
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Notes & Observations</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dosage, plant response..."
              className="w-full p-2.5 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7] resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
            >
              {isSubmitting ? 'Recording...' : 'Record Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 5. AUTH MODAL ---
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('+1 (555) 234-5678');
  const [password, setPassword] = useState('floraq2026');
  const [fullName, setFullName] = useState('Dr. Evelyn Vance');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (isRegister) {
        const res = await api.register(phoneNumber, password, fullName);
        onSuccess(res.user);
      } else {
        const res = await api.login(phoneNumber, password);
        onSuccess(res.user);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoSignIn = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await api.demoLogin();
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setErrorMsg('Demo login failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const fbUser = await signInWithGoogle();
      const demoRes = await api.demoLogin();
      onSuccess({
        ...demoRes.user,
        full_name: fbUser.displayName || fbUser.email || demoRes.user.full_name,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36]">
            {isRegister ? 'Register FloraQ Account' : 'Sign In to FloraQ'}
          </h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="w-full py-2.5 px-3 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition"
        >
          <Cloud className="w-4 h-4 text-[#DCEFE2]" />
          <span>Sign in with Google (Firebase Cloud)</span>
        </button>

        <button
          type="button"
          onClick={handleDemoSignIn}
          disabled={isSubmitting}
          className="w-full py-2 px-3 rounded-lg bg-[#DCEFE2] hover:bg-[#c9e7d2] text-[#174D36] text-xs font-bold border border-[#39805B]/30 flex items-center justify-center gap-1.5 transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#39805B]" />
          <span>Instant Demo Sign In (1-Click)</span>
        </button>

        <div className="text-center text-[10px] text-[#718078] uppercase font-bold relative before:absolute before:left-0 before:top-2 before:w-full before:h-px before:bg-[#E2EAE4]">
          <span className="bg-white px-2 relative z-10">Or with Phone & Password</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {isRegister && (
            <div>
              <label className="font-semibold text-[#20352A] block mb-1">Full Name</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
              />
            </div>
          )}

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Phone Number (with Country Code)</label>
            <input
              type="text"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2 rounded-lg bg-[#174D36] text-white text-xs font-semibold shadow-sm"
          >
            {isSubmitting ? 'Authenticating...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>

          <div className="text-center pt-1 text-[11px] text-[#718078]">
            {isRegister ? (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(false)}
                  className="font-bold text-[#174D36]"
                >
                  Log In
                </button>
              </span>
            ) : (
              <span>
                Need an account?{' '}
                <button
                  type="button"
                  onClick={() => setIsRegister(true)}
                  className="font-bold text-[#174D36]"
                >
                  Register
                </button>
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

// --- 6. USER SETTINGS MODAL ---
interface SettingsModalProps {
  isOpen: boolean;
  user: UserProfile | null;
  firebaseUser?: FirebaseUser | null;
  plants?: Plant[];
  onClose: () => void;
  onUpdate: (user: UserProfile) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  user,
  firebaseUser,
  plants = [],
  onClose,
  onUpdate,
}) => {
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!isOpen || !user) return null;

  const projectInfo = getFirebaseProjectInfo();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.updateProfile(fullName);
      onUpdate(res.user);
      onClose();
    } catch (err) {
      alert('Error updating profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectGoogle = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const fbUser = await signInWithGoogle();
      const count = await syncLocalPlantsToFirestore(plants);
      setSyncMessage(`Connected as ${fbUser.email || fbUser.uid}. Synced ${count} plant plans.`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Google Sign-In failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const count = await syncLocalPlantsToFirestore(plants);
      setSyncMessage(`Synced ${count} plant plans to Firestore.`);
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Firestore sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setIsSyncing(true);
    try {
      await signOutFirebase();
      setSyncMessage('Disconnected from Firebase Google Auth.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-[#E2EAE4] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E2EAE4]">
          <h3 className="text-base font-bold text-[#174D36]">User Profile & Settings</h3>
          <button onClick={onClose} className="text-[#718078] hover:text-[#20352A]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-[#F7FAF7]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Registered Phone</label>
            <input
              type="text"
              readOnly
              value={user.phone_number}
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-gray-100 text-[#718078]"
            />
          </div>

          <div>
            <label className="font-semibold text-[#20352A] block mb-1">Chamber Authorization Role</label>
            <input
              type="text"
              readOnly
              value="System Owner / Principal Investigator"
              className="w-full px-3 py-2 rounded-lg border border-[#E2EAE4] bg-gray-100 text-[#718078]"
            />
          </div>

          {/* Firebase Firestore & Google Auth Cloud Sync */}
          <div className="p-3 rounded-xl bg-[#F7FAF7] border border-[#E2EAE4] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#174D36] flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5 text-[#39805B]" />
                Firestore Cloud Sync
              </span>
              <span className="text-[10px] font-mono text-[#718078]">{projectInfo.projectId}</span>
            </div>

            {firebaseUser ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{firebaseUser.email || firebaseUser.displayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="flex-1 py-1.5 px-2 rounded-lg bg-[#DCEFE2] hover:bg-[#c9e7d2] text-[#174D36] font-semibold text-[11px]"
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Plans Now'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    disabled={isSyncing}
                    className="py-1.5 px-2 rounded-lg border border-[#E2EAE4] text-[#718078] hover:text-rose-600 text-[11px]"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogle}
                disabled={isSyncing}
                className="w-full py-1.5 px-3 rounded-lg bg-[#174D36] hover:bg-[#206044] text-white font-semibold text-[11px]"
              >
                {isSyncing ? 'Connecting...' : 'Sign in with Google to Sync'}
              </button>
            )}

            {syncMessage && (
              <p className="text-[10px] text-[#39805B] font-medium">{syncMessage}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2EAE4]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#E2EAE4] text-xs font-medium text-[#718078]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg bg-[#174D36] text-white text-xs font-semibold"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
