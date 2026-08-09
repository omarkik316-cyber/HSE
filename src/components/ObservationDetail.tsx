"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import type { Observation, ObservationStatus, ObservationComment, ObservationPriority } from "@/types";
import { CATEGORIES } from "@/types";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  observation: Observation;
  userId: string;
  userRole: string;
  onClose: () => void;
  onUpdated: () => void;
}

function toDateTimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function ObservationDetail({ observation, userId, userRole, onClose, onUpdated }: Props) {
  const [comments, setComments] = useState<ObservationComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Editable field state, seeded from the current observation
  const [editTitle, setEditTitle] = useState(observation.title);
  const [editDescription, setEditDescription] = useState(observation.description ?? "");
  const [editCategory, setEditCategory] = useState(observation.category);
  const [editPriority, setEditPriority] = useState<ObservationPriority>(observation.priority);
  const [editContractor, setEditContractor] = useState(observation.assigned_contractor ?? "");
  const [editDueDate, setEditDueDate] = useState(toDateTimeLocal(observation.due_date));

  useEffect(() => {
    async function loadComments() {
      const { data } = await supabase
        .from("observation_comments")
        .select("*, profiles(full_name, role)")
        .eq("observation_id", observation.id)
        .order("created_at", { ascending: true });
      setComments(data ?? []);
    }
    loadComments();
  }, [observation.id]);

  const canUpdateStatus = userRole === "safety_officer" || userRole === "admin" || userRole === "contractor";
  const canEditDetails = userRole === "safety_officer" || userRole === "admin";

  async function updateStatus(newStatus: ObservationStatus) {
    setBusy(true);
    try {
      if (afterPhoto) {
        const fileExt = afterPhoto.name.split(".").pop();
        const filePath = `${observation.id}/after-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("observation-photos")
          .upload(filePath, afterPhoto);
        if (!uploadError) {
          const { data: publicUrl } = supabase.storage
            .from("observation-photos")
            .getPublicUrl(filePath);
          await supabase.from("observation_photos").insert({
            observation_id: observation.id,
            photo_url: publicUrl.publicUrl,
            photo_type: "after",
            uploaded_by: userId,
          });
        }
      }

      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newStatus === "closed") {
        updatePayload.closed_at = new Date().toISOString();
        updatePayload.closed_by = userId;
      }

      const { error } = await supabase.from("observations").update(updatePayload).eq("id", observation.id);
      if (error) {
        alert(`Failed to update status: ${error.message}`);
        return;
      }

      await supabase.from("observation_comments").insert({
        observation_id: observation.id,
        author_id: userId,
        comment: `Status changed to ${newStatus.replace("_", " ")}`,
        status_change_to: newStatus,
      });

      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("observations")
        .update({
          title: editTitle,
          description: editDescription || null,
          category: editCategory,
          priority: editPriority,
          assigned_contractor: editContractor || null,
          due_date: editDueDate ? new Date(editDueDate).toISOString() : null,
        })
        .eq("id", observation.id);

      if (error) {
        alert(`Failed to save changes: ${error.message}`);
        return;
      }

      await supabase.from("observation_comments").insert({
        observation_id: observation.id,
        author_id: userId,
        comment: "Observation details were edited",
      });

      setIsEditing(false);
      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    if (!newComment.trim()) return;
    setBusy(true);
    try {
      await supabase.from("observation_comments").insert({
        observation_id: observation.id,
        author_id: userId,
        comment: newComment.trim(),
      });
      setNewComment("");
      const { data } = await supabase
        .from("observation_comments")
        .select("*, profiles(full_name, role)")
        .eq("observation_id", observation.id)
        .order("created_at", { ascending: true });
      setComments(data ?? []);
    } finally {
      setBusy(false);
    }
  }

  const beforePhotos = observation.observation_photos?.filter((p) => p.photo_type === "before") ?? [];
  const afterPhotos = observation.observation_photos?.filter((p) => p.photo_type === "after") ?? [];

  const isOverdue =
    observation.status !== "closed" &&
    observation.due_date &&
    new Date(observation.due_date) < new Date();

  if (isEditing) {
    return (
      <div className="p-5 space-y-4 overflow-y-auto h-full">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Edit Observation</h3>
          <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div>
          <label htmlFor="edit-title" className="block text-sm font-medium mb-1">Title</label>
          <input
            id="edit-title"
            name="title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-category" className="block text-sm font-medium mb-1">Category</label>
            <select
              id="edit-category"
              name="category"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="edit-priority" className="block text-sm font-medium mb-1">Priority</label>
            <select
              id="edit-priority"
              name="priority"
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as ObservationPriority)}
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
          <label htmlFor="edit-description" className="block text-sm font-medium mb-1">Description</label>
          <textarea
            id="edit-description"
            name="description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-contractor" className="block text-sm font-medium mb-1">
              Assigned Safety Officer / Contractor
            </label>
            <input
              id="edit-contractor"
              name="assigned_contractor"
              value={editContractor}
              onChange={(e) => setEditContractor(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="edit-due-date" className="block text-sm font-medium mb-1">Due Date &amp; Time</label>
            <input
              id="edit-due-date"
              name="due_date"
              type="datetime-local"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            disabled={busy}
            onClick={saveEdits}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 text-sm font-medium border rounded-lg"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">{observation.title}</h3>
          <p className="text-sm text-gray-500">{observation.zone_name ?? "Unknown zone"}</p>
        </div>
        <div className="flex items-center gap-2">
          {canEditDetails && (
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs px-2 py-1 border rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Edit
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <StatusBadge status={observation.status} />
        <PriorityBadge priority={observation.priority} />
        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
          {observation.category}
        </span>
        {observation.profiles?.role === "consultant" && (
          <span className="text-xs px-2 py-1 rounded-full bg-blue-600 text-white font-semibold">
            Consultant · same-day close
          </span>
        )}
        {isOverdue && (
          <span className="text-xs px-2 py-1 rounded-full bg-red-600 text-white font-semibold">
            OVERDUE
          </span>
        )}
      </div>

      {observation.description && (
        <p className="text-sm text-gray-700">{observation.description}</p>
      )}

      <div className="text-xs text-gray-500 space-y-1">
        <p>Reported: {formatDistanceToNow(new Date(observation.created_at))} ago</p>
        {observation.assigned_contractor && <p>Assigned: {observation.assigned_contractor}</p>}
        {observation.due_date && (
          <p>Due: {format(new Date(observation.due_date), "d MMM yyyy, h:mm a")}</p>
        )}
      </div>

      {beforePhotos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">Before (violation)</p>
          <div className="flex gap-2 flex-wrap">
            {beforePhotos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.photo_url} alt="Before" className="w-24 h-24 object-cover rounded-lg border" />
            ))}
          </div>
        </div>
      )}

      {afterPhotos.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1">After (corrected)</p>
          <div className="flex gap-2 flex-wrap">
            {afterPhotos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.photo_url} alt="After" className="w-24 h-24 object-cover rounded-lg border" />
            ))}
          </div>
        </div>
      )}

      {canUpdateStatus && observation.status !== "closed" && (
        <div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Update status</p>
          {observation.status === "open" && (
            <button
              disabled={busy}
              onClick={() => updateStatus("in_progress")}
              className="w-full bg-amber-500 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              Mark In Progress
            </button>
          )}
          <div>
            <label htmlFor="after-photo" className="block text-xs text-gray-500 mb-1">Correction photo (optional)</label>
            <input
              id="after-photo"
              name="after_photo"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => setAfterPhoto(e.target.files?.[0] ?? null)}
              className="w-full text-sm mb-2"
            />
            <button
              disabled={busy}
              onClick={() => updateStatus("closed")}
              className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              Mark Closed
            </button>
          </div>
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-sm font-medium mb-2">Activity log</p>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="text-xs bg-slate-50 rounded-lg p-2">
              <span className="font-medium">{c.profiles?.full_name ?? "User"}</span>: {c.comment}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <label htmlFor="new-comment" className="sr-only">Add a note</label>
          <input
            id="new-comment"
            name="comment"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a note..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={postComment}
            disabled={busy}
            className="px-3 py-2 bg-slate-800 text-white rounded-lg text-sm"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
