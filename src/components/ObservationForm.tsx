"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { notifyObservationCreated } from "@/lib/notifications";
import { compressImage } from "@/lib/imageCompress";
import { addPendingObservation, isLikelyNetworkError } from "@/lib/offlineQueue";
import { CATEGORIES } from "@/types";
import type { ObservationPriority } from "@/types";

interface ObservationFormProps {
  lng: number;
  lat: number;
  zoneName: string | null;
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
  // Fired instead of a hard failure when the observation couldn't be sent
  // because of a weak/dropped connection — it's been queued for automatic
  // retry, not lost. Optional so this component still works without it.
  onQueued?: (message: string) => void;
}

function nowForDateTimeLocalInput(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60000;
  const local = new Date(now.getTime() - offsetMs);
  return local.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

// Turns a raw Supabase/Postgres error into something a non-technical user
// can actually act on, instead of a cryptic one-liner.
function explainError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    const full = parts.join(" — ");
    if (full.toLowerCase().includes("row-level security") || e.code === "42501") {
      return `Permission denied: your account role isn't allowed to create observations. Ask an admin to check your role on the "Manage Users" page. (${full})`;
    }
    if (full) return full;
  }
  return err instanceof Error ? err.message : "Failed to create observation";
}

export default function ObservationForm({
  lng,
  lat,
  zoneName,
  userId,
  onCreated,
  onCancel,
  onQueued,
}: ObservationFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [priority, setPriority] = useState<ObservationPriority>("medium");
  const [assignedContractor, setAssignedContractor] = useState("");
  const [dueDate, setDueDate] = useState(nowForDateTimeLocalInput);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Brief checkmark overlay shown right after a successful submit, instead
  // of the panel just vanishing the instant the request resolves.
  const [showSuccess, setShowSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Shrink the photo up front — this both lowers the chance the upload
    // times out on a weak connection and keeps whatever gets queued (if it
    // still fails) small enough to sit comfortably in local storage.
    const uploadPhoto = photoFile ? await compressImage(photoFile) : null;
    const dueDateISO = dueDate ? new Date(dueDate).toISOString() : null;

    try {
      const { data: observation, error: insertError } = await supabase
        .from("observations")
        .insert({
          title,
          description,
          category,
          priority,
          status: "open",
          latitude: lat,
          longitude: lng,
          zone_name: zoneName,
          reported_by: userId,
          assigned_contractor: assignedContractor || null,
          due_date: dueDateISO,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Observation insert failed:", insertError);
        throw insertError;
      }

      // Upload photo if provided
      if (uploadPhoto && observation) {
        const fileExt = uploadPhoto.name.split(".").pop();
        const filePath = `${observation.id}/before-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("observation-photos")
          .upload(filePath, uploadPhoto);

        if (uploadError) {
          console.error("Photo upload failed:", uploadError);
          throw uploadError;
        }

        const { data: publicUrl } = supabase.storage
          .from("observation-photos")
          .getPublicUrl(filePath);

        await supabase.from("observation_photos").insert({
          observation_id: observation.id,
          photo_url: publicUrl.publicUrl,
          photo_type: "before",
          uploaded_by: userId,
        });
      }

      // Let everyone know a new observation just went up — this is a
      // best-effort notification, so it never blocks or fails the actual
      // observation creation above.
      if (observation) {
        notifyObservationCreated({
          title,
          zoneName,
          observationId: observation.id,
          createdBy: userId,
        });
      }

      setSubmitting(false);
      setShowSuccess(true);
      // Let the checkmark play for a beat before the panel closes — long
      // enough to register, short enough not to feel like a delay.
      setTimeout(onCreated, 650);
    } catch (err) {
      // A weak/dropped connection shouldn't lose the report or leave the
      // person stuck on an error screen — queue it and let them keep going,
      // the same way a chat app holds an unsent message and retries it.
      if (isLikelyNetworkError(err)) {
        try {
          await addPendingObservation({
            title,
            description,
            category,
            priority,
            lat,
            lng,
            zoneName,
            userId,
            assignedContractor: assignedContractor || null,
            dueDateISO,
            photo: uploadPhoto,
          });
          setSubmitting(false);
          onQueued?.(
            "الاتصال ضعيف — تم حفظ الملاحظة على جهازك وسيتم إرسالها تلقائيًا. راجع الإعدادات لمتابعتها."
          );
          onCreated();
          return;
        } catch (queueErr) {
          console.error("Failed to queue observation for offline retry:", queueErr);
          // Fall through to the normal inline error below — at least the
          // person sees *something* went wrong instead of silence.
        }
      }
      setError(explainError(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative h-full flex flex-col bg-white dark:bg-slate-900">
      {showSuccess && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 dark:bg-slate-900/95 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center animate-check-pop">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#059669"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Observation saved</p>
        </div>
      )}

      <div className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3 pt-safe border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-lg font-semibold">New Safety Observation</h3>
          {zoneName && (
            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">📍 Zone detected: {zoneName}</p>
          )}
          {!zoneName && (
            <p className="text-sm text-gray-400 mt-1">📍 Outside known project zones</p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="tap shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-xl leading-none px-1"
          aria-label="Cancel"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div>
          <label htmlFor="obs-title" className="block text-sm font-medium mb-1">Title</label>
          <input
            id="obs-title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            placeholder="e.g. Worker without harness at height"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="obs-category" className="block text-sm font-medium mb-1">Category</label>
            <select
              id="obs-category"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="obs-priority" className="block text-sm font-medium mb-1">Priority</label>
            <select
              id="obs-priority"
              name="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ObservationPriority)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="obs-description" className="block text-sm font-medium mb-1">Description</label>
          <textarea
            id="obs-description"
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            placeholder="What did you observe?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="obs-contractor" className="block text-sm font-medium mb-1">
              Assigned Safety Officer / Contractor
            </label>
            <input
              id="obs-contractor"
              name="assigned_contractor"
              value={assignedContractor}
              onChange={(e) => setAssignedContractor(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
              placeholder="Company name"
            />
          </div>
          <div>
            <label htmlFor="obs-due-date" className="block text-sm font-medium mb-1">Due Date &amp; Time</label>
            <input
              id="obs-due-date"
              name="due_date"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label htmlFor="obs-photo" className="block text-sm font-medium mb-1">Photo</label>
          <input
            id="obs-photo"
            name="photo"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-2 px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 mb-4">
        <button
          type="submit"
          disabled={submitting}
          className="tap flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-70 flex items-center justify-center gap-2"
        >
          {submitting && (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.35" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          )}
          {submitting ? "Saving..." : "Create Observation"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="tap px-4 py-3 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
