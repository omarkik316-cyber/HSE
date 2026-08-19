"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onCancel: () => void;
  // Called if getUserMedia itself throws (permission denied at the OS
  // prompt, no camera hardware, etc.) — separate from onCancel so the
  // caller can fall back to the native file input instead of just closing.
  onError: () => void;
}

// Some Android WebViews (notably on China-market ROMs without a fully
// updated System WebView) don't honor <input type="file" capture> —
// tapping it opens a generic file/browser chooser instead of jumping
// straight into the camera. Driving the camera ourselves via
// getUserMedia sidesteps that entirely: it's a live preview rendered
// inside the app, with no dependency on how the OS wires up the file
// picker's camera intent.
export default function CameraCapture({ onCapture, onCancel, onError }: CameraCaptureProps) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch {
        // Denied permission, no camera hardware, or an environment that
        // claims getUserMedia support but doesn't really have it.
        //
        // IMPORTANT: we do NOT auto-trigger the native file-input fallback
        // from here. This catch runs asynchronously, well after the tap
        // that opened this screen — by then the browser's "this came from
        // a real user tap" flag (user activation) has expired. Calling
        // input.click() at this point gets silently ignored on most mobile
        // browsers: nothing visibly happens, which is exactly the
        // "opens for a moment then closes with nothing after it" behavior.
        // Instead we show a real button; a tap on THAT button is a fresh,
        // genuine user gesture, so the fallback click actually works.
        if (!cancelled) setFailed(true);
      }
    }

    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [capturedUrl]);

  function handleShutter() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedUrl(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    setCapturedBlob(null);
  }

  function handleUsePhoto() {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    onCapture(file);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {failed ? (
          <div className="px-8 text-center">
            <p className="text-white text-sm leading-relaxed mb-5">{t("obsForm.cameraUnavailable")}</p>
            <button
              type="button"
              onClick={onError}
              className="tap inline-block text-sm font-semibold px-5 py-2.5 rounded-xl bg-blue-600 text-white"
            >
              {t("obsForm.useDevicePicker")}
            </button>
          </div>
        ) : capturedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={capturedUrl} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}
        {!ready && !failed && !capturedUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="white" strokeOpacity="0.35" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="white" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      <div className="shrink-0 px-6 pt-4 pb-safe pb-8 grid grid-cols-3 items-center">
        <div className="justify-self-start">
          <button
            type="button"
            onClick={onCancel}
            className="tap text-white text-sm font-medium px-4 py-2.5 rounded-xl bg-white/15"
          >
            {t("obsForm.cancel")}
          </button>
        </div>

        <div className="justify-self-center">
          {!failed && !capturedUrl && (
            <button
              type="button"
              onClick={handleShutter}
              disabled={!ready}
              aria-label={t("obsForm.takePhoto")}
              className="tap w-16 h-16 rounded-full bg-white border-4 border-white/40 disabled:opacity-50"
            />
          )}
        </div>

        <div className="justify-self-end">
          {capturedUrl && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRetake}
                className="tap text-white text-xs font-medium px-3 py-2.5 rounded-xl bg-white/15 whitespace-nowrap"
              >
                {t("obsForm.retakePhoto")}
              </button>
              <button
                type="button"
                onClick={handleUsePhoto}
                className="tap text-xs font-semibold px-4 py-2.5 rounded-xl bg-blue-600 text-white whitespace-nowrap"
              >
                {t("obsForm.usePhoto")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
