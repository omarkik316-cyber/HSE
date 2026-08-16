"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { notifyStatusChanged } from "@/lib/notifications";
import { compressImage } from "@/lib/imageCompress";
import { stampPhoto } from "@/lib/photoStamp";
import { isObservationOverdue } from "@/lib/overdue";
import { StatusBadge, PriorityBadge } from "./StatusBadge";
import type { Observation, ObservationStatus, ObservationComment, ObservationPriority } from "@/types";
import { CATEGORIES } from "@/types";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  observation: Observation;
  userId: string;
  userName: string;
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

const ACTION_LABELS: Record<string, string> = {
  open: "Reopened",
  in_progress: "Marked In Progress",
  pending_review: "Submitted for Review",
  closed: "Approved & Closed",
};

const inputCls =
  "w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-xl px-3 py-2.5 text-sm";

export default function ObservationDetail({ observation, userId, userName, userRole, onClose, onUpdated }: Props) {
  const [comments, setComments] = useState<ObservationComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);
  const [afterPhotoPreviewUrl, setAfterPhotoPreviewUrl] = useState<string | null>(null);
  const [stampingPhoto, setStampingPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Full-screen preview for a tapped photo — thumbnails are only 96x96px,
  // too small to actually make out details like a harness or a tag number.
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const afterCameraInputRef = useRef<HTMLInputElement>(null);
  const afterGalleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (afterPhotoPreviewUrl) URL.revokeObjectURL(afterPhotoPreviewUrl);
    };
  }, [afterPhotoPreviewUrl]);

  // Same stamping as the "before" photo on the new-observation form — name,
  // date/time, and the observation's coordinates baked into the image,
  // whether it came from the camera or the gallery.
  async function handleAfterPhotoPicked(file: File | null) {
    if (!file) return;
    setStampingPhoto(true);
    try {
      const stamped = await stampPhoto(file, {
        name: userName,
        lat: observation.latitude,
        lng: observation.longitude,
        zoneName: observation.zone_name,
      });
      if (afterPhotoPreviewUrl) URL.revokeObjectURL(afterPhotoPreviewUrl);
      setAfterPhoto(stamped);
      setAfterPhotoPreviewUrl(URL.createObjectURL(stamped));
    } finally {
      setStampingPhoto(false);
    }
  }

  // Editable field state, seeded from the current observation
  const [editTitle, setEditTitle] = useState(observation.title);
  const [editDescription, setEditDescription] = useState(observation.description ?? "");
  const [editCategory, setEditCategory] = useState(observation.category);
  const [editPriority, setEditPriority] = useState<ObservationPriority>(observation.priority);
  const [editContractor, setEditContractor] = useState(observation.assigned_contractor ?? "");
  const [editDueDate, setEditDueDate] = useState(toDateTimeLocal(observation.due_date));

  async function reloadComments() {
    const { data } = await supabase
      .from("observation_comments")
      .select("*, profiles(full_name, role)")
      .eq("observation_id", observation.id)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
  }

  useEffect(() => {
    reloadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observation.id]);

  // Contractors submit fixes; safety officers/consultants/admins raise
  // observations and move them in_progress. Only admins approve or reject
  // a submitted fix — that's the review gate the person asked for.
  const canWorkOn = userRole === "safety_officer" || userRole === "admin" || userRole === "contractor";
  const canEditDetails = userRole === "safety_officer" || userRole === "admin";
  const canReview = userRole === "admin";
  // Full, permanent delete (not a status change) — reserved for admin and
  // manager, the two roles trusted to remove a bad/duplicate report entirely.
  const canDelete = userRole === "admin" || userRole === "manager";
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const { error } = await supabase.from("observations").delete().eq("id", observation.id);
      if (error) throw error;
      onUpdated();
      onClose();
    } catch (err) {
      console.error("Failed to delete observation:", err);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  async function changeStatus(
    newStatus: ObservationStatus,
    actionComment: string,
    extraPayload: Record<string, unknown> = {}
  ) {
    setBusy(true);
    try {
      if (afterPhoto) {
        const compressed = await compressImage(afterPhoto);
        const fileExt = compressed.name.split(".").pop();
        const filePath = `${observation.id}/after-${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("observation-photos")
          .upload(filePath, compressed);
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

      const updatePayload: Record<string, unknown> = { status: newStatus, ...extraPayload };

      const { error } = await supabase.from("observations").update(updatePayload).eq("id", observation.id);
      if (error) {
        alert(`Failed to update status: ${error.message}`);
        return;
      }

      await supabase.from("observation_comments").insert({
        observation_id: observation.id,
        author_id: userId,
        comment: actionComment,
        status_change_to: newStatus,
      });

      notifyStatusChanged({
        title: observation.title,
        zoneName: observation.zone_name,
        observationId: observation.id,
        newStatus,
        actorId: userId,
      });

      onUpdated();
    } finally {
      setBusy(false);
    }
  }

  function submitForReview() {
    changeStatus("pending_review", ACTION_LABELS.pending_review);
  }

  function approveAndClose() {
    changeStatus("closed", ACTION_LABELS.closed, {
      closed_at: new Date().toISOString(),
      closed_by: userId,
    });
  }

  async function confirmReject() {
    if (!rejectReason.trim()) {
      alert("Please add a reason so the contractor knows what to fix.");
      return;
    }
    await changeStatus("in_progress", `Rejected — needs rework: ${rejectReason.trim()}`);
    setRejecting(false);
    setRejectReason("");
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
      await reloadComments();
    } finally {
      setBusy(false);
    }
  }

  const beforePhotos = observation.observation_photos?.filter((p) => p.photo_type === "before") ?? [];
  const afterPhotos = observation.observation_photos?.filter((p) => p.photo_type === "after") ?? [];

  const isOverdue = isObservationOverdue(observation);

  if (isEditing) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-slate-900">
        <div className="shrink-0 flex items-center justify-between px-5 pt-5 pb-3 pt-safe border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-semibold">Edit Observation</h3>
          <button onClick={() => setIsEditing(false)} className="tap text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 text-xl leading-none px-1">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label htmlFor="edit-title" className="block text-sm font-medium mb-1">Title</label>
            <input
              id="edit-title"
              name="title"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className={inputCls}
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
                className={inputCls}
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
                className={inputCls}
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
              className={inputCls}
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
                className={inputCls}
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
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 flex gap-2 px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 mb-4">
          <button
            disabled={busy}
            onClick={saveEdits}
            className="tap flex-1 bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save Changes"}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="tap px-4 py-3 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-slate-900">
      <div className="shrink-0 flex items-start justify-between gap-2 px-5 pt-5 pb-3 pt-safe border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">
            <span className="text-slate-400 dark:text-slate-500 font-normal">#{observation.ticket_no}</span>{" "}
            {observation.title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">{observation.zone_name ?? "Unknown zone"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canEditDetails && (
            <button
              onClick={() => setIsEditing(true)}
              className="tap text-xs px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="tap text-xs px-2 py-1 border border-red-200 dark:border-red-900 rounded-lg text-red-600 dark:text-red-400"
            >
              Delete
            </button>
          )}
          <button onClick={onClose} className="tap text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 text-xl leading-none px-1">✕</button>
        </div>
      </div>

      {confirmingDelete && (
        <div className="shrink-0 px-5 py-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 dark:text-red-300">
            Delete this observation permanently? This removes its photos and comments too — it can&apos;t be undone.
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="tap text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="tap text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <StatusBadge status={observation.status} />
          <PriorityBadge priority={observation.priority} />
          <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
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
          <p className="text-sm text-gray-700 dark:text-slate-300">{observation.description}</p>
        )}

        <div className="text-xs text-gray-500 dark:text-slate-400 space-y-1">
          <p>Reported: {formatDistanceToNow(new Date(observation.created_at))} ago</p>
          {observation.assigned_contractor && <p>Assigned: {observation.assigned_contractor}</p>}
          {observation.claimed_by_profile && (
            <p>🔒 Claimed by: {observation.claimed_by_profile.full_name}</p>
          )}
          {observation.due_date && (
            <p>Due: {format(new Date(observation.due_date), "d MMM yyyy, h:mm a")}</p>
          )}
        </div>

        {beforePhotos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Before (violation)</p>
            <div className="flex gap-2 flex-wrap">
              {beforePhotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.photo_url}
                  alt="Before"
                  onClick={() => setLightboxUrl(p.photo_url)}
                  className="tap w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
              ))}
            </div>
          </div>
        )}

        {afterPhotos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">After (corrected)</p>
            <div className="flex gap-2 flex-wrap">
              {afterPhotos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.photo_url}
                  alt="After"
                  onClick={() => setLightboxUrl(p.photo_url)}
                  className="tap w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer"
                />
              ))}
            </div>
          </div>
        )}

        {/* Contractor / safety officer / admin workflow: open -> in progress -> submit for review */}
        {canWorkOn && (observation.status === "open" || observation.status === "in_progress") && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
            <p className="text-sm font-medium">Update status</p>
            {observation.status === "open" && (
              <button
                disabled={busy}
                onClick={() =>
                  changeStatus("in_progress", `${ACTION_LABELS.in_progress} — claimed by this user`, {
                    claimed_by: userId,
                    claimed_at: new Date().toISOString(),
                  })
                }
                className="tap w-full bg-amber-500 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
              >
                Mark In Progress
              </button>
            )}
            {observation.status === "in_progress" && (
              <>
                {(observation.claimed_by === userId || userRole === "admin") ? (
                  <div>
                    {observation.claimed_by && observation.claimed_by !== userId && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 mb-2">
                        Claimed by {observation.claimed_by_profile?.full_name ?? "another user"} — you&apos;re
                        acting as admin.
                      </p>
                    )}
                    <label className="block text-xs text-gray-500 dark:text-slate-400 mb-1">
                      Correction photo
                    </label>
                    <input
                      ref={afterCameraInputRef}
                      id="after-photo-camera"
                      name="after_photo_camera"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => {
                        handleAfterPhotoPicked(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <input
                      ref={afterGalleryInputRef}
                      id="after-photo-gallery"
                      name="after_photo_gallery"
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        handleAfterPhotoPicked(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                      className="hidden"
                    />
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => afterCameraInputRef.current?.click()}
                        className="tap flex-1 border border-slate-200 dark:border-slate-700 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        📷 Take Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => afterGalleryInputRef.current?.click()}
                        className="tap flex-1 border border-slate-200 dark:border-slate-700 rounded-xl py-2 text-xs font-medium flex items-center justify-center gap-1"
                      >
                        🖼️ From Gallery
                      </button>
                    </div>
                    {stampingPhoto && <p className="text-xs text-slate-400 mb-2">Stamping photo...</p>}
                    {!stampingPhoto && afterPhotoPreviewUrl && (
                      <div className="mb-2 relative inline-block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={afterPhotoPreviewUrl}
                          alt="Correction photo preview"
                          className="w-24 h-24 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (afterPhotoPreviewUrl) URL.revokeObjectURL(afterPhotoPreviewUrl);
                            setAfterPhoto(null);
                            setAfterPhotoPreviewUrl(null);
                          }}
                          aria-label="Remove photo"
                          className="tap absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center shadow"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <button
                      disabled={busy || stampingPhoto}
                      onClick={submitForReview}
                      className="tap w-full bg-cyan-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                    >
                      Submit for Review
                    </button>
                    <p className="text-[11px] text-gray-400 mt-1">
                      An admin will review the fix and either approve &amp; close it, or send it back for rework.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2.5">
                    🔒 Claimed by <strong>{observation.claimed_by_profile?.full_name ?? "another user"}</strong>.
                    Only they (or an admin) can submit the fix for this one.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Admin review gate: approve or reject a submitted fix */}
        {canReview && observation.status === "pending_review" && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
            <p className="text-sm font-medium text-cyan-700 dark:text-cyan-400">Review this fix</p>
            {!rejecting ? (
              <div className="flex gap-2">
                <button
                  disabled={busy}
                  onClick={approveAndClose}
                  className="tap flex-1 bg-green-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  ✓ Approve &amp; Close
                </button>
                <button
                  disabled={busy}
                  onClick={() => setRejecting(true)}
                  className="tap flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                >
                  ✕ Reject
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <label htmlFor="reject-reason" className="block text-xs text-gray-500 dark:text-slate-400">
                  Why is this being sent back? (the contractor will see this)
                </label>
                <textarea
                  id="reject-reason"
                  name="reject_reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="e.g. Photo doesn't show the harness properly attached"
                />
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={confirmReject}
                    className="tap flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejecting(false);
                      setRejectReason("");
                    }}
                    className="tap px-4 py-2.5 text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {observation.status === "pending_review" && !canReview && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <p className="text-xs text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800 rounded-xl px-3 py-2">
              Waiting on admin review.
            </p>
          </div>
        )}

        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <p className="text-sm font-medium mb-2">Activity Log</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {comments.map((c) => {
              const isAction = !!c.status_change_to;
              return (
                <div
                  key={c.id}
                  className={
                    isAction
                      ? "text-xs bg-slate-50 dark:bg-slate-800/70 border-l-2 border-slate-400 dark:border-slate-600 rounded-r-lg p-2"
                      : "text-xs bg-slate-50 dark:bg-slate-800/70 rounded-lg p-2"
                  }
                >
                  {isAction && (
                    <span className="inline-block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1.5">
                      Action:
                    </span>
                  )}
                  <span className="font-medium">{c.profiles?.full_name ?? "User"}</span>
                  {" — "}
                  {c.comment}
                </div>
              );
            })}
            {comments.length === 0 && (
              <p className="text-xs text-gray-400">No activity yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 flex gap-2 px-5 pt-3 pb-safe border-t border-slate-100 dark:border-slate-800 mb-4">
        <label htmlFor="new-comment" className="sr-only">Add a note</label>
        <input
          id="new-comment"
          name="comment"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a note..."
          className={`flex-1 ${inputCls}`}
        />
        <button
          onClick={postComment}
          disabled={busy}
          className="tap px-4 py-2.5 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-sm font-medium"
        >
          Send
        </button>
      </div>

      {/* Full-screen photo preview — tap the backdrop or the close button
          to dismiss. Rendered above everything else in the app (z-50). */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center animate-fade-in"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
            className="tap absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white text-xl leading-none flex items-center justify-center"
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
}
