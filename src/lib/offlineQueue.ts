import { supabase } from "@/lib/supabaseClient";
import { notifyObservationCreated } from "@/lib/notifications";
import { compressImage } from "@/lib/imageCompress";
import type { ObservationPriority } from "@/types";

// ---------------------------------------------------------------------------
// When a site connection is weak, an observation (and especially its photo)
// can fail to send mid-submit. Instead of losing the report or blocking the
// person on a spinner, we save it on the device and keep retrying in the
// background — the same pattern WhatsApp uses for a message that couldn't
// send. The person sees it under Settings → Pending Uploads and can keep
// working in the meantime.
//
// Photos are binary and can be a few hundred KB even after compression, so
// this uses IndexedDB (not localStorage, which is text-only and much
// smaller) to store the queue.
// ---------------------------------------------------------------------------

export interface PendingObservationInput {
  title: string;
  description: string;
  category: string;
  priority: ObservationPriority;
  lat: number;
  lng: number;
  zoneName: string | null;
  userId: string;
  assignedContractor: string | null;
  dueDateISO: string | null;
  photo: File | null;
}

// A raw `File` object can't be reliably written to IndexedDB on every
// device — some Android WebViews fail to structured-clone/store it at all,
// silently, which was taking the *entire* report down with it (see
// addPendingObservation below). Converting to plain bytes + metadata before
// it ever reaches IndexedDB is what every device can store.
interface StoredPhoto {
  name: string;
  type: string;
  data: ArrayBuffer;
}

export interface PendingObservationRecord extends Omit<PendingObservationInput, "photo"> {
  id: string;
  createdAt: number;
  status: "pending" | "syncing" | "failed" | "partial";
  lastError: string | null;
  attempts: number;
  // Set the moment the observations row is actually created on the server.
  // Retrying never re-checks "did this fully succeed before" any other
  // way than this field — without it, a retry after a failed photo upload
  // would call submitPendingObservation() again and insert a SECOND
  // observations row for the same report.
  serverObservationId?: string | null;
  // True once the photo (if any) is uploaded and linked. A record with a
  // serverObservationId set but photoUploaded false/undefined is the
  // "partial" case: the report itself is already live and visible to
  // everyone, just missing its photo.
  photoUploaded?: boolean;
  photo: StoredPhoto | null;
  // True when a photo was attached but couldn't be stored on the device at
  // all (as opposed to photoUploaded=false, which just means "not sent to
  // the server yet"). The report itself is still saved and queued — only
  // the photo was dropped.
  photoDropped?: boolean;
}

async function fileToStoredPhoto(file: File): Promise<StoredPhoto> {
  const data = await file.arrayBuffer();
  return { name: file.name, type: file.type, data };
}

function storedPhotoToFile(photo: StoredPhoto): File {
  return new File([photo.data], photo.name, { type: photo.type });
}

const DB_NAME = "hse-offline-queue";
const STORE = "pending-observations";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// --- pub/sub so the Settings badge/list and the dashboard can react live ---
type Listener = () => void;
const listeners = new Set<Listener>();
function notifyListeners() {
  listeners.forEach((l) => l());
}
export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function getPendingObservations(): Promise<PendingObservationRecord[]> {
  try {
    const all = await withStore<PendingObservationRecord[]>("readonly", (store) => store.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } catch (err) {
    console.error("Failed to read offline queue:", err);
    return [];
  }
}

export async function addPendingObservation(input: PendingObservationInput): Promise<PendingObservationRecord> {
  // The photo may already be compressed by the caller (the normal submit
  // path compresses once before attempting the direct upload) — compressing
  // an already-small file is a cheap no-op, so it's safe to do here too for
  // any caller that skips that step.
  const compressed = input.photo ? await compressImage(input.photo) : null;

  let storedPhoto: StoredPhoto | null = null;
  let photoDropped = false;
  if (compressed) {
    try {
      storedPhoto = await fileToStoredPhoto(compressed);
    } catch (err) {
      // Reading the file into bytes failed (very rare) — don't let that
      // take the report down with it, just carry on without the photo.
      console.error("Failed to prepare photo for offline storage:", err);
      photoDropped = true;
    }
  }

  const { photo: _inputPhoto, ...rest } = input;
  const record: PendingObservationRecord = {
    ...rest,
    photo: storedPhoto,
    photoDropped,
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    status: "pending",
    lastError: null,
    attempts: 0,
  };

  try {
    await withStore("readwrite", (store) => store.put(record));
  } catch (err) {
    // Belt-and-suspenders: even plain bytes can fail to persist on a
    // device that's completely out of storage. Never let that take the
    // whole report down — drop the photo and save the report text-only
    // instead of losing it outright.
    if (record.photo) {
      console.error("Failed to store photo offline, saving report without it:", err);
      record.photo = null;
      record.photoDropped = true;
      await withStore("readwrite", (store) => store.put(record));
    } else {
      throw err;
    }
  }

  notifyListeners();
  return record;
}

export async function removePendingObservation(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
  notifyListeners();
}

async function updateRecord(record: PendingObservationRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(record));
  notifyListeners();
}

async function submitPendingObservation(record: PendingObservationRecord): Promise<void> {
  // Phase A — create the observations row. Skipped entirely if a previous
  // attempt already got this far: retrying never re-inserts once
  // serverObservationId is set, which is what stops a failed photo upload
  // from turning into a duplicate report on the next retry.
  let observationId: string | null = record.serverObservationId ?? null;
  let justCreated = false;

  if (!observationId) {
    const { data: observation, error: insertError } = await supabase
      .from("observations")
      .insert({
        title: record.title,
        description: record.description,
        category: record.category,
        priority: record.priority,
        status: "open",
        latitude: record.lat,
        longitude: record.lng,
        zone_name: record.zoneName,
        reported_by: record.userId,
        assigned_contractor: record.assignedContractor,
        due_date: record.dueDateISO,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Captured into its own non-null const rather than relying on TS to
    // keep narrowing `observationId` (a mutable `let`) across the `await`
    // below — that narrowing doesn't survive the await, so every use
    // after it still sees the wider `string | null` type.
    const newObservationId: string = observation.id;
    observationId = newObservationId;
    justCreated = true;
    // Persisted immediately — before touching the photo — so even if the
    // app closes mid-upload, the next retry already knows the report
    // itself exists and only has the photo left to finish.
    record.serverObservationId = newObservationId;
    await updateRecord(record);

    notifyObservationCreated({
      title: record.title,
      zoneName: record.zoneName,
      observationId: newObservationId,
      createdBy: record.userId,
    });
  }

  // Phase B — the photo, only if there is one and it isn't already up.
  if (record.photo && !record.photoUploaded) {
    // observationId is guaranteed set by this point: either it came in
    // already set on the record, or the block above just set it.
    const photoObservationId = observationId as string;
    try {
      const file = storedPhotoToFile(record.photo);
      const fileExt = file.name.split(".").pop();
      const filePath = `${photoObservationId}/before-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("observation-photos")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: publicUrl } = supabase.storage.from("observation-photos").getPublicUrl(filePath);

      await supabase.from("observation_photos").insert({
        observation_id: photoObservationId,
        photo_url: publicUrl.publicUrl,
        photo_type: "before",
        uploaded_by: record.userId,
      });

      record.photoUploaded = true;
    } catch (photoErr) {
      // The report itself is already safely on the server (either just
      // now, or on an earlier attempt) — only the photo failed. Thrown as
      // a distinct error type so retryPendingObservation can tell this
      // apart from "nothing was sent at all" and mark the record
      // "partial" instead of "failed".
      throw new PhotoUploadError(
        photoErr instanceof Error ? photoErr.message : "Failed to upload photo",
        justCreated
      );
    }
  }
}

// Thrown only from the photo-upload phase in submitPendingObservation, so
// retryPendingObservation can tell "report sent, photo failed" apart from
// "nothing reached the server" and mark the record accordingly instead of
// treating every failure the same way.
class PhotoUploadError extends Error {
  constructor(message: string, public readonly justCreated: boolean) {
    super(message);
    this.name = "PhotoUploadError";
  }
}

/** Retries a single queued item. Returns ok:false with a message on failure — never throws. */
export async function retryPendingObservation(id: string): Promise<{ ok: boolean; partial?: boolean; error?: string }> {
  const all = await getPendingObservations();
  const record = all.find((r) => r.id === id);
  if (!record) return { ok: false, error: "Not found" };
  if (record.status === "syncing") return { ok: false, error: "Already syncing" };

  record.status = "syncing";
  await updateRecord(record);

  try {
    await submitPendingObservation(record);
    await removePendingObservation(id);
    return { ok: true };
  } catch (err) {
    const partial = err instanceof PhotoUploadError;
    const message = err instanceof Error ? err.message : "Failed to send";
    record.status = partial ? "partial" : "failed";
    record.lastError = message;
    record.attempts += 1;
    await updateRecord(record);
    return { ok: false, partial, error: message };
  }
}

/** Sweeps the whole queue. Silently skips while offline instead of failing every item one by one. */
export async function retryAllPendingObservations(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const all = await getPendingObservations();
  for (const record of all) {
    if (record.status === "syncing") continue;
    // Sequential on purpose — several photo uploads at once is exactly the
    // kind of load that made the connection fail in the first place.
    await retryPendingObservation(record.id);
  }
}

/** True when an error looks like a dropped/weak connection rather than a real validation/permission problem. */
export function isLikelyNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true; // fetch()'s own signature for "network request never completed"
  if (err && typeof err === "object") {
    const message = ((err as { message?: string }).message ?? "").toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("network") ||
      message.includes("load failed") ||
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("err_connection") ||
      message.includes("err_internet")
    );
  }
  return false;
}

let autoSyncStarted = false;
/** Call once from the app shell. Retries the queue when connectivity returns and on a periodic sweep. */
export function startAutoSync(): void {
  if (autoSyncStarted || typeof window === "undefined") return;
  autoSyncStarted = true;

  window.addEventListener("online", () => {
    retryAllPendingObservations();
  });

  // Some WebViews don't fire `online` reliably on a flaky (not fully down)
  // connection, so also sweep periodically while the app is open.
  setInterval(() => {
    retryAllPendingObservations();
  }, 45000);

  // Anything left over from last session gets a chance right away.
  retryAllPendingObservations();
}
