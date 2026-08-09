"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES } from "@/types";
import type { ObservationPriority } from "@/types";

interface ObservationFormProps {
  lng: number;
  lat: number;
  zoneName: string | null;
  userId: string;
  onCreated: () => void;
  onCancel: () => void;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

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
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Observation insert failed:", insertError);
        throw insertError;
      }

      // Upload photo if provided
      if (photoFile && observation) {
        const fileExt = photoFile.name.split(".").pop();
        const filePath = `${observation.id}/before-${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("observation-photos")
          .upload(filePath, photoFile);

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

      onCreated();
    } catch (err) {
      setError(explainError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-5">
      <div>
        <h3 className="text-lg font-semibold">New Safety Observation</h3>
        {zoneName && (
          <p className="text-sm text-blue-600 mt-1">📍 Zone detected: {zoneName}</p>
        )}
        {!zoneName && (
          <p className="text-sm text-gray-400 mt-1">📍 Outside known project zones</p>
        )}
      </div>

      <div>
        <label htmlFor="obs-title" className="block text-sm font-medium mb-1">Title</label>
        <input
          id="obs-title"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
          className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
            className="w-full border rounded-lg px-3 py-2 text-sm"
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
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? "Saving..." : "Create Observation"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium border rounded-lg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
