import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
  Unsubscribe,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Plant, GrowthCycle, DailyObservation, CareEvent } from '../types.js';

const DEFAULT_APP_NAME = '[DEFAULT]';

const firebaseApp =
  getApps().find((a) => a.name === DEFAULT_APP_NAME) || initializeApp(firebaseConfig);

export const firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
export const firebaseAuth = getAuth(firebaseApp);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: firebaseAuth.currentUser?.uid,
      email: firebaseAuth.currentUser?.email,
      emailVerified: firebaseAuth.currentUser?.emailVerified,
      isAnonymous: firebaseAuth.currentUser?.isAnonymous,
      tenantId: firebaseAuth.currentUser?.tenantId,
      providerInfo:
        firebaseAuth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

// Defensive payload sanitization aligned with firebase-blueprint.json
function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = (raw || '').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function clampString(val: string | undefined | null, maxLen: number, fallback = ''): string {
  const s = (val ?? fallback).toString();
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(firebaseAuth, provider);
  await syncUserProfile(cred.user);
  return cred.user;
}

export async function signOutFirebase(): Promise<void> {
  await signOut(firebaseAuth);
}

export function subscribeFirebaseAuth(
  onChange: (user: User | null, ready: boolean) => void
): Unsubscribe {
  return onAuthStateChanged(firebaseAuth, (user) => {
    onChange(user, true);
  });
}

export async function syncUserProfile(user: User): Promise<void> {
  if (!user.emailVerified) return;
  const uid = sanitizeId(user.uid, 'user');
  const displayName = clampString(user.displayName || user.email?.split('@')[0] || 'FloraQ Cultivator', 100);
  const email = clampString(user.email, 254);

  const publicPath = `users/${uid}`;
  const publicRef = doc(firestoreDb, 'users', uid);
  try {
    const existingPublic = await getDoc(publicRef);
    if (!existingPublic.exists()) {
      await setDoc(publicRef, {
        uid,
        displayName,
        role: 'owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        publicRef,
        {
          displayName,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  if (email) {
    const privatePath = `users/${uid}/private/info`;
    const privateRef = doc(firestoreDb, 'users', uid, 'private', 'info');
    try {
      const existingPrivate = await getDoc(privateRef);
      const photoUrl = user.photoURL ? clampString(user.photoURL, 500) : undefined;
      if (!existingPrivate.exists()) {
        await setDoc(privateRef, {
          uid,
          email,
          displayName,
          ...(photoUrl ? { photoURL: photoUrl } : {}),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          privateRef,
          {
            email,
            displayName,
            ...(photoUrl ? { photoURL: photoUrl } : {}),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }
}

function timestampToIso(ts: unknown): string {
  if (ts && typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof ts === 'string') return ts;
  return new Date().toISOString();
}

export function subscribeCloudPlants(
  uid: string,
  onPlants: (plants: Plant[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'plants';
  const q = query(collection(firestoreDb, path), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const list: Plant[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          owner_id: String(data.ownerId || uid),
          plan_name: String(data.planName || ''),
          display_number: Number(data.displayNumber || 1),
          plant_name: String(data.plantName || ''),
          species: String(data.species || ''),
          chamber_id: String(data.chamberId || 'chamber-alpha-01'),
          planting_date: String(data.plantingDate || ''),
          status: (data.status as Plant['status']) || 'active',
          notes: String(data.notes || ''),
          created_at: timestampToIso(data.createdAt),
          updated_at: timestampToIso(data.updatedAt),
        };
      });
      onPlants(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeCloudPlantSubcollections(
  uid: string,
  plantId: string,
  callbacks: {
    onCycles?: (cycles: GrowthCycle[]) => void;
    onObservations?: (observations: DailyObservation[]) => void;
    onCareEvents?: (careEvents: CareEvent[]) => void;
    onError?: (err: Error) => void;
  }
): Unsubscribe {
  const safePlantId = sanitizeId(plantId, 'plant');
  const unsubs: Unsubscribe[] = [];

  if (callbacks.onCycles) {
    const cyclesPath = `plants/${safePlantId}/cycles`;
    const cq = query(collection(firestoreDb, 'plants', safePlantId, 'cycles'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        cq,
        (snap) => {
          const items: GrowthCycle[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              plant_id: String(data.plantId || safePlantId),
              cycle_number: Number(data.cycleNumber || 1),
              cycle_name: String(data.cycleName || ''),
              objective: String(data.objective || ''),
              start_at: String(data.startAt || ''),
              end_at: data.endAt ? String(data.endAt) : null,
              status: (data.status as GrowthCycle['status']) || 'active',
              notes: String(data.notes || ''),
              created_at: timestampToIso(data.createdAt),
              updated_at: timestampToIso(data.updatedAt),
            };
          });
          callbacks.onCycles?.(items);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, cyclesPath);
          } catch (wrapped) {
            if (callbacks.onError && wrapped instanceof Error) callbacks.onError(wrapped);
          }
        }
      )
    );
  }

  if (callbacks.onObservations) {
    const obsPath = `plants/${safePlantId}/observations`;
    const oq = query(collection(firestoreDb, 'plants', safePlantId, 'observations'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        oq,
        (snap) => {
          const items: DailyObservation[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              plant_id: String(data.plantId || safePlantId),
              cycle_id: String(data.cycleId || ''),
              observed_at: String(data.observedAt || ''),
              plant_height: typeof data.plantHeight === 'number' ? data.plantHeight : null,
              soil_ph: typeof data.soilPh === 'number' ? data.soilPh : null,
              health_observations: String(data.healthObservations || ''),
              notes: String(data.notes || ''),
              created_by: String(data.ownerId || uid),
              created_at: timestampToIso(data.createdAt),
            };
          });
          callbacks.onObservations?.(items);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, obsPath);
          } catch (wrapped) {
            if (callbacks.onError && wrapped instanceof Error) callbacks.onError(wrapped);
          }
        }
      )
    );
  }

  if (callbacks.onCareEvents) {
    const carePath = `plants/${safePlantId}/careEvents`;
    const eq = query(collection(firestoreDb, 'plants', safePlantId, 'careEvents'), where('ownerId', '==', uid));
    unsubs.push(
      onSnapshot(
        eq,
        (snap) => {
          const items: CareEvent[] = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              plant_id: String(data.plantId || safePlantId),
              cycle_id: String(data.cycleId || ''),
              event_type: (data.eventType as CareEvent['event_type']) || 'watering',
              event_time: String(data.eventTime || ''),
              quantity: typeof data.quantity === 'number' ? data.quantity : undefined,
              unit: typeof data.unit === 'string' ? data.unit : undefined,
              method: typeof data.method === 'string' ? data.method : undefined,
              product_name: typeof data.productName === 'string' ? data.productName : undefined,
              notes: String(data.notes || ''),
              source: (data.source as CareEvent['source']) || 'manual',
              zone: typeof data.zone === 'string' ? data.zone : undefined,
              duration_seconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
              created_at: timestampToIso(data.createdAt),
            };
          });
          callbacks.onCareEvents?.(items);
        },
        (error) => {
          try {
            handleFirestoreError(error, OperationType.LIST, carePath);
          } catch (wrapped) {
            if (callbacks.onError && wrapped instanceof Error) callbacks.onError(wrapped);
          }
        }
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function savePlantToFirestore(plant: Plant): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const plantId = sanitizeId(plant.id, 'plant');
  const path = `plants/${plantId}`;
  const docRef = doc(firestoreDb, 'plants', plantId);

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        id: plantId,
        ownerId: user.uid,
        planName: clampString(plant.plan_name, 120, 'Plant Plan'),
        displayNumber: Math.max(1, Math.min(100000, Number(plant.display_number) || 1)),
        plantName: clampString(plant.plant_name, 120, 'Plant'),
        species: clampString(plant.species, 120, 'Unknown species'),
        chamberId: sanitizeId(plant.chamber_id || 'chamber-alpha-01', 'chamber').slice(0, 64),
        plantingDate: clampString(plant.planting_date || new Date().toISOString().slice(0, 10), 32),
        status: plant.status || 'active',
        notes: clampString(plant.notes, 2000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePlantFromFirestore(plantId: string): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  const safeId = sanitizeId(plantId, 'plant');
  const path = `plants/${safeId}`;
  try {
    await deleteDoc(doc(firestoreDb, 'plants', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCycleToFirestore(plant: Plant, cycle: GrowthCycle): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  await savePlantToFirestore(plant);
  const plantId = sanitizeId(plant.id, 'plant');
  const cycleId = sanitizeId(cycle.id, 'cycle');
  const path = `plants/${plantId}/cycles/${cycleId}`;

  try {
    await setDoc(doc(firestoreDb, 'plants', plantId, 'cycles', cycleId), {
      id: cycleId,
      plantId,
      ownerId: user.uid,
      cycleNumber: Math.max(1, Math.min(10000, Number(cycle.cycle_number) || 1)),
      cycleName: clampString(cycle.cycle_name, 120, 'Cycle 1'),
      objective: clampString(cycle.objective, 500, 'Growth cycle'),
      status: cycle.status || 'active',
      startAt: clampString(cycle.start_at || new Date().toISOString(), 64),
      ...(cycle.end_at ? { endAt: clampString(cycle.end_at, 64) } : {}),
      notes: clampString(cycle.notes, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveObservationToFirestore(
  plant: Plant,
  obs: DailyObservation
): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  await savePlantToFirestore(plant);
  const plantId = sanitizeId(plant.id, 'plant');
  const obsId = sanitizeId(obs.id, 'obs');
  const cycleId = sanitizeId(obs.cycle_id || 'cycle-1', 'cycle');
  const path = `plants/${plantId}/observations/${obsId}`;

  try {
    await setDoc(doc(firestoreDb, 'plants', plantId, 'observations', obsId), {
      id: obsId,
      plantId,
      ownerId: user.uid,
      cycleId,
      observedAt: clampString(obs.observed_at || new Date().toISOString(), 64),
      ...(typeof obs.plant_height === 'number'
        ? { plantHeight: Math.max(0, Math.min(5000, obs.plant_height)) }
        : {}),
      ...(typeof obs.soil_ph === 'number'
        ? { soilPh: Math.max(0, Math.min(14, obs.soil_ph)) }
        : {}),
      healthObservations: clampString(obs.health_observations, 1000, 'Logged'),
      notes: clampString(obs.notes, 2000),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveCareEventToFirestore(
  plant: Plant,
  event: CareEvent
): Promise<void> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return;

  await savePlantToFirestore(plant);
  const plantId = sanitizeId(plant.id, 'plant');
  const eventId = sanitizeId(event.id, 'care');
  const cycleId = sanitizeId(event.cycle_id || 'cycle-1', 'cycle');
  const path = `plants/${plantId}/careEvents/${eventId}`;

  try {
    await setDoc(doc(firestoreDb, 'plants', plantId, 'careEvents', eventId), {
      id: eventId,
      plantId,
      ownerId: user.uid,
      cycleId,
      eventType: event.event_type || 'watering',
      eventTime: clampString(event.event_time || new Date().toISOString(), 64),
      ...(typeof event.quantity === 'number'
        ? { quantity: Math.max(0, Math.min(1000000, event.quantity)) }
        : {}),
      ...(event.unit ? { unit: clampString(event.unit, 32) } : {}),
      ...(event.method ? { method: clampString(event.method, 160) } : {}),
      ...(event.product_name ? { productName: clampString(event.product_name, 160) } : {}),
      notes: clampString(event.notes, 2000),
      source: event.source || 'manual',
      ...(event.zone ? { zone: clampString(event.zone, 32) } : {}),
      ...(typeof event.duration_seconds === 'number'
        ? { durationSeconds: Math.max(0, Math.min(86400, event.duration_seconds)) }
        : {}),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function syncLocalPlantsToFirestore(plants: Plant[]): Promise<number> {
  const user = firebaseAuth.currentUser;
  if (!user || !user.emailVerified) return 0;

  let synced = 0;
  for (const plant of plants) {
    await savePlantToFirestore(plant);
    synced += 1;
  }
  return synced;
}

export function getFirebaseProjectInfo() {
  return {
    projectId: firebaseConfig.projectId,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
  };
}
