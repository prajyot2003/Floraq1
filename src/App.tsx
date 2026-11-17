import React, { useState, useEffect, useCallback } from 'react';
import {
  Navbar,
} from './components/Navbar.js';
import { Dashboard } from './components/Dashboard.js';
import { PlantDetail } from './components/PlantDetail.js';
import { LiveCamera } from './components/LiveCamera.js';
import { CycleManagement } from './components/CycleManagement.js';
import { AIPlantHealth } from './components/AIPlantHealth.js';
import { AIGrowthVisualization } from './components/AIGrowthVisualization.js';
import { DeviceManagement } from './components/DeviceManagement.js';
import { ObservationAndCareLogs } from './components/ObservationAndCareLogs.js';
import {
  AddPlantModal,
  NewCycleModal,
  LogObservationModal,
  RecordCareModal,
  AuthModal,
  SettingsModal,
} from './components/Modals.js';
import {
  Plant,
  UserProfile,
  CameraDevice,
  GatewayDevice,
  PlantImage,
  AIAnalysis,
  GrowthCycle,
  DailyObservation,
  CareEvent,
  SensorReading,
  PhytopodTelemetrySnapshot,
  PhytopodControlState,
  PhytopodHardwareStatus,
} from './types.js';
import { api, getStoredToken } from './api.js';
import {
  subscribeFirebaseConnection,
  subscribeTelemetry,
  subscribeControls,
  FirebaseConnectionState,
} from './lib/firebase.js';
import { User as FirebaseUser } from 'firebase/auth';
import {
  subscribeFirebaseAuth,
  signOutFirebase,
  syncUserProfile,
  subscribeCloudPlants,
  subscribeCloudPlantSubcollections,
  deletePlantFromFirestore,
} from './lib/firestore.js';
import {
  createEmptyTelemetrySnapshot,
  DEFAULT_CONTROLS_STATE,
} from './lib/phytopod.js';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string>('');
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [camera, setCamera] = useState<CameraDevice | null>(null);
  const [gateways, setGateways] = useState<GatewayDevice[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [images, setImages] = useState<PlantImage[]>([]);
  const [analyses, setAnalyses] = useState<AIAnalysis[]>([]);
  const [cycles, setCycles] = useState<GrowthCycle[]>([]);
  const [observations, setObservations] = useState<DailyObservation[]>([]);
  const [careEvents, setCareEvents] = useState<CareEvent[]>([]);
  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [isStreamActive, setIsStreamActive] = useState<boolean>(false);
  const [firebaseState, setFirebaseState] = useState<FirebaseConnectionState>('unconfigured');
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<PhytopodTelemetrySnapshot>(() =>
    createEmptyTelemetrySnapshot()
  );
  const [liveControls, setLiveControls] = useState<PhytopodControlState>(() => ({
    ...DEFAULT_CONTROLS_STATE,
  }));
  const [phytopodStatus, setPhytopodStatus] = useState<PhytopodHardwareStatus | null>(null);

  // Modals state
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddPlantOpen, setIsAddPlantOpen] = useState(false);
  const [isNewCycleOpen, setIsNewCycleOpen] = useState(false);
  const [isObservationOpen, setIsObservationOpen] = useState(false);
  const [isCareOpen, setIsCareOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);

  // Firebase Google Auth state listener
  useEffect(() => {
    const unsub = subscribeFirebaseAuth((fbUser, ready) => {
      setFirebaseUser(fbUser);
      setFirebaseAuthReady(ready);
      if (fbUser && fbUser.emailVerified) {
        syncUserProfile(fbUser).catch((err) => {
          console.warn('[FloraQ Firestore] Profile sync failed:', err);
        });
      }
    });
    return () => unsub();
  }, []);

  // 1. Initial Authentication & Profile bootstrap
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = getStoredToken();
        if (token) {
          const res = await api.getMe();
          setUser(res.user);
        } else {
          // Auto login demo account for instant seamless evaluation
          const demoRes = await api.demoLogin();
          setUser(demoRes.user);
        }
      } catch (err) {
        console.warn('Authentication bootstrap fallback to demo:', err);
        try {
          const demoRes = await api.demoLogin();
          setUser(demoRes.user);
        } catch {
          // ignore
        }
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  // 2. Fetch Plants and Chamber Hardware
  const refreshAllPlants = useCallback(async () => {
    try {
      const pRes = await api.getPlants();
      setPlants(pRes.plants);
      if (pRes.plants.length > 0 && !selectedPlantId) {
        setSelectedPlantId(pRes.plants[0].id);
      }
    } catch (err) {
      console.error('Error fetching plants:', err);
    }
  }, [selectedPlantId]);

  const refreshGatewaysAndCameras = useCallback(async () => {
    try {
      const [cRes, gRes, pStatus] = await Promise.all([
        api.getCameras(),
        api.getGateways(),
        api.getPhytopodStatus().catch(() => null),
      ]);
      if (cRes.cameras.length > 0) {
        setCamera(cRes.cameras[0]);
        setIsStreamActive(cRes.cameras[0].status === 'streaming');
      }
      setGateways(gRes.gateways);
      setSyncLogs(gRes.sync_logs);
      if (pStatus) {
        setPhytopodStatus(pStatus);
      }
    } catch (err) {
      console.error('Error fetching hardware info:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      refreshAllPlants();
      refreshGatewaysAndCameras();
    }
  }, [user, refreshAllPlants, refreshGatewaysAndCameras]);

  // 3. Fetch selected plant details
  const refreshSelectedPlantData = useCallback(async (plantId: string) => {
    if (!plantId) return;
    try {
      const res = await api.getPlant(plantId);
      setCycles(res.cycles);
      setReadings(res.latest_readings);
      setCareEvents(res.care_events);
      setObservations(res.observations);
      setImages(res.recent_images);
      setAnalyses(res.analyses);
      if (res.camera) setCamera(res.camera);
    } catch (err) {
      console.error('Error fetching plant detail data:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedPlantId) {
      refreshSelectedPlantData(selectedPlantId);
    }
  }, [selectedPlantId, refreshSelectedPlantData]);

  // 4. Firebase Realtime Database Subscriptions (/telemetry & /controls)
  useEffect(() => {
    const unsubConn = subscribeFirebaseConnection((state, errMsg) => {
      setFirebaseState(state);
      setFirebaseError(errMsg ?? null);
    });
    const unsubTelemetry = subscribeTelemetry(
      (snapshot) => {
        setLiveTelemetry(snapshot);
      },
      (err) => {
        setFirebaseError(err.message);
      }
    );
    const unsubControls = subscribeControls(
      (controls) => {
        setLiveControls(controls);
      },
      (err) => {
        setFirebaseError(err.message);
      }
    );

    return () => {
      unsubConn();
      unsubTelemetry();
      unsubControls();
    };
  }, []);

  // 4b. Firestore real-time cloud listeners (only attached when authenticated & verified)
  useEffect(() => {
    if (!firebaseAuthReady || !firebaseUser || !firebaseUser.emailVerified) {
      return;
    }

    const unsubPlants = subscribeCloudPlants(
      firebaseUser.uid,
      (cloudPlants) => {
        if (cloudPlants.length === 0) return;
        setPlants((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const cp of cloudPlants) {
            const existing = map.get(cp.id);
            map.set(cp.id, existing ? { ...existing, ...cp } : cp);
          }
          return Array.from(map.values());
        });
      },
      (err) => {
        console.warn('[FloraQ Firestore] Plants listener error:', err.message);
      }
    );

    return () => {
      unsubPlants();
    };
  }, [firebaseAuthReady, firebaseUser]);

  useEffect(() => {
    if (!firebaseAuthReady || !firebaseUser || !firebaseUser.emailVerified || !selectedPlantId) {
      return;
    }

    const unsubSub = subscribeCloudPlantSubcollections(firebaseUser.uid, selectedPlantId, {
      onCycles: (cloudCycles) => {
        if (cloudCycles.length === 0) return;
        setCycles((prev) => {
          const map = new Map(prev.map((c) => [c.id, c]));
          for (const cc of cloudCycles) {
            const existing = map.get(cc.id);
            map.set(cc.id, existing ? { ...existing, ...cc } : cc);
          }
          return Array.from(map.values());
        });
      },
      onObservations: (cloudObs) => {
        if (cloudObs.length === 0) return;
        setObservations((prev) => {
          const map = new Map(prev.map((o) => [o.id, o]));
          for (const co of cloudObs) {
            const existing = map.get(co.id);
            map.set(co.id, existing ? { ...existing, ...co } : co);
          }
          return Array.from(map.values());
        });
      },
      onCareEvents: (cloudCare) => {
        if (cloudCare.length === 0) return;
        setCareEvents((prev) => {
          const map = new Map(prev.map((e) => [e.id, e]));
          for (const ce of cloudCare) {
            const existing = map.get(ce.id);
            map.set(ce.id, existing ? { ...existing, ...ce } : ce);
          }
          return Array.from(map.values());
        });
      },
      onError: (err) => {
        console.warn('[FloraQ Firestore] Subcollection listener error:', err.message);
      },
    });

    return () => {
      unsubSub();
    };
  }, [firebaseAuthReady, firebaseUser, selectedPlantId]);

  // 5. Server-Sent Events (SSE) Bus Listener for Real-Time Telemetry & Hardware Events
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/events');

    eventSource.addEventListener('sensor_telemetry', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // If matches selected plant, append to live readings
        if (data.plant_id === selectedPlantId && Array.isArray(data.readings)) {
          setReadings((prev) => [...data.readings, ...prev]);
        }
        // Refresh overview cards
        refreshAllPlants();
      } catch (err) {
        console.error('Error processing SSE sensor event:', err);
      }
    });

    eventSource.addEventListener('phytopod_status', () => {
      refreshGatewaysAndCameras();
    });

    eventSource.addEventListener('care_event_logged', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.care_event && data.care_event.plant_id === selectedPlantId) {
          refreshSelectedPlantData(selectedPlantId);
        }
      } catch (err) {
        console.error('Error parsing care_event_logged SSE event:', err);
      }
    });

    eventSource.addEventListener('camera_status', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setIsStreamActive(data.status === 'streaming');
      } catch (err) {
        console.error('Error parsing camera status:', err);
      }
    });

    eventSource.addEventListener('new_plant_image', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.image) {
          setImages((prev) => [data.image, ...prev]);
        }
      } catch (err) {
        console.error('Error parsing new image SSE event:', err);
      }
    });

    eventSource.addEventListener('ai_analysis_completed', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.analysis) {
          setAnalyses((prev) => [data.analysis, ...prev]);
        }
      } catch (err) {
        console.error('Error parsing ai analysis SSE event:', err);
      }
    });

    return () => {
      eventSource.close();
    };
  }, [selectedPlantId, refreshAllPlants, refreshGatewaysAndCameras, refreshSelectedPlantData]);

  // Handle Plant Selection
  const handleSelectPlant = (plantId: string) => {
    setSelectedPlantId(plantId);
    setCurrentTab('plant-detail');
  };

  const currentPlant = plants.find((p) => p.id === selectedPlantId) || plants[0];
  const activeCycle = cycles.find((c) => c.status === 'active') || cycles[cycles.length - 1] || null;

  const handleExportCSV = () => {
    if (!currentPlant) return;
    const token = getStoredToken();
    const url = `/api/v1/plants/${currentPlant.id}/export.csv${token ? `?token=${token}` : ''}`;
    window.location.href = url;
  };

  const handleLogout = async () => {
    await api.logout();
    if (firebaseUser) {
      await signOutFirebase().catch(() => {});
    }
    setUser(null);
    setIsAuthOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7FAF7] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-[#174D36] text-[#DCEFE2] flex items-center justify-center mx-auto animate-pulse">
            <span className="text-xl font-bold">FQ</span>
          </div>
          <p className="text-sm font-semibold text-[#174D36]">Initializing FloraQ Botanical Systems...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7FAF7] flex flex-col text-[#20352A]">
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onLogout={handleLogout}
        onOpenSimulator={() => setCurrentTab('devices')}
        isStreamActive={isStreamActive}
        firebaseConnected={firebaseState === 'connected'}
        hasSensorError={
          firebaseState === 'connected' &&
          liveTelemetry.source === 'firebase_rtdb' &&
          Boolean(liveTelemetry.validation?.has_sensor_error)
        }
        firebaseUserEmail={firebaseUser?.email ?? null}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentTab === 'dashboard' && (
          <Dashboard
            plants={plants}
            liveTelemetry={liveTelemetry}
            firebaseState={firebaseState}
            onSelectPlant={handleSelectPlant}
            onOpenAddPlant={() => setIsAddPlantOpen(true)}
            onOpenNewCycle={(pId) => {
              setSelectedPlantId(pId);
              setIsNewCycleOpen(true);
            }}
            onOpenLiveCamera={(pId) => {
              setSelectedPlantId(pId);
              setCurrentTab('camera');
            }}
            onOpenAIDiagnosis={(pId) => {
              setSelectedPlantId(pId);
              setCurrentTab('ai-health');
            }}
            onDeletePlant={async (pId) => {
              await api.deletePlant(pId);
              if (firebaseUser) {
                await deletePlantFromFirestore(pId).catch(() => {});
              }
              refreshAllPlants();
            }}
          />
        )}

        {currentTab === 'plant-detail' && currentPlant && (
          <PlantDetail
            plant={currentPlant}
            cycles={cycles}
            activeCycle={activeCycle}
            readings={readings}
            careEvents={careEvents}
            observations={observations}
            liveTelemetry={liveTelemetry}
            firebaseState={firebaseState}
            onBack={() => setCurrentTab('dashboard')}
            onOpenObservationModal={() => setIsObservationOpen(true)}
            onOpenCareEventModal={() => setIsCareOpen(true)}
            onOpenLiveCamera={() => setCurrentTab('camera')}
            onOpenAIDiagnosis={() => setCurrentTab('ai-health')}
            onOpenNewCycle={() => setIsNewCycleOpen(true)}
            onOpenIoTGateway={() => setCurrentTab('devices')}
            onExportCSV={handleExportCSV}
          />
        )}

        {currentTab === 'camera' && currentPlant && (
          <LiveCamera
            plant={currentPlant}
            plants={plants}
            camera={camera}
            images={images}
            cycles={cycles}
            onSelectPlant={(pId) => setSelectedPlantId(pId)}
            onRefreshImages={() => refreshSelectedPlantData(currentPlant.id)}
            onAnalyzeImage={(imgId) => setCurrentTab('ai-health')}
          />
        )}

        {currentTab === 'cycles' && currentPlant && (
          <CycleManagement
            plant={currentPlant}
            plants={plants}
            cycles={cycles}
            observations={observations}
            careEvents={careEvents}
            onSelectPlant={(pId) => setSelectedPlantId(pId)}
            onOpenNewCycle={() => setIsNewCycleOpen(true)}
            onRefreshCycles={() => refreshSelectedPlantData(currentPlant.id)}
          />
        )}

        {currentTab === 'ai-health' && currentPlant && (
          <AIPlantHealth
            plant={currentPlant}
            plants={plants}
            images={images}
            analyses={analyses}
            onSelectPlant={(pId) => setSelectedPlantId(pId)}
            onRefreshAnalyses={() => refreshSelectedPlantData(currentPlant.id)}
            onOpenLiveCamera={() => setCurrentTab('camera')}
          />
        )}

        {currentTab === 'ai-growth' && currentPlant && (
          <AIGrowthVisualization
            plant={currentPlant}
            plants={plants}
            onSelectPlant={(pId) => setSelectedPlantId(pId)}
          />
        )}

        {currentTab === 'devices' && (
          <DeviceManagement
            gateways={gateways}
            syncLogs={syncLogs}
            plants={plants}
            selectedPlantId={selectedPlantId}
            firebaseState={firebaseState}
            firebaseError={firebaseError}
            liveTelemetry={liveTelemetry}
            liveControls={liveControls}
            phytopodStatus={phytopodStatus}
            onRefreshGateways={refreshGatewaysAndCameras}
            onWateringLogged={() => {
              if (selectedPlantId) {
                refreshSelectedPlantData(selectedPlantId);
              }
            }}
          />
        )}

        {currentTab === 'logs' && currentPlant && (
          <ObservationAndCareLogs
            plant={currentPlant}
            plants={plants}
            careEvents={careEvents}
            observations={observations}
            onSelectPlant={(pId) => setSelectedPlantId(pId)}
            onOpenObservationModal={() => setIsObservationOpen(true)}
            onOpenCareEventModal={() => setIsCareOpen(true)}
            onExportCSV={handleExportCSV}
          />
        )}
      </main>

      {/* Global Modals */}
      <AddPlantModal
        isOpen={isAddPlantOpen}
        onClose={() => setIsAddPlantOpen(false)}
        onSuccess={refreshAllPlants}
      />

      {currentPlant && (
        <>
          <NewCycleModal
            isOpen={isNewCycleOpen}
            plantId={currentPlant.id}
            plant={currentPlant}
            onClose={() => setIsNewCycleOpen(false)}
            onSuccess={() => refreshSelectedPlantData(currentPlant.id)}
          />
          <LogObservationModal
            isOpen={isObservationOpen}
            plantId={currentPlant.id}
            plant={currentPlant}
            onClose={() => setIsObservationOpen(false)}
            onSuccess={() => refreshSelectedPlantData(currentPlant.id)}
          />
          <RecordCareModal
            isOpen={isCareOpen}
            plantId={currentPlant.id}
            plant={currentPlant}
            onClose={() => setIsCareOpen(false)}
            onSuccess={() => refreshSelectedPlantData(currentPlant.id)}
          />
        </>
      )}

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(newUser) => setUser(newUser)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        user={user}
        firebaseUser={firebaseUser}
        plants={plants}
        onClose={() => setIsSettingsOpen(false)}
        onUpdate={(updated) => setUser(updated)}
      />
    </div>
  );
}
