"use client";

import { Camera, ImagePlus, RefreshCcw, SwitchCamera } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert, Spinner } from "@/components/ui/primitives";

type State =
  | { kind: "starting" }
  | { kind: "live" }
  | { kind: "preview"; url: string; blob: Blob }
  | { kind: "error"; message: string };

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera in your browser's site settings, or choose a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device. You can choose a photo instead.";
  if (name === "NotReadableError") return "The camera is being used by another app. Close it and try again, or choose a photo instead.";
  return "The camera couldn't be started. You can choose a photo instead.";
}

/**
 * Take a photo with the device camera (getUserMedia), preview it, then retake or use it.
 * Falls back to the system photo picker / camera (`capture`) where live camera access isn't available.
 * Camera tracks are always stopped when the dialog closes.
 */
export function CameraCapture({ open, onOpenChange, onCapture }: { open: boolean; onOpenChange: (open: boolean) => void; onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "starting" });
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  // Bumped to restart the camera (retake) without changing direction.
  const [attempt, setAttempt] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Starts (or restarts) the camera whenever the dialog is open; every state update happens after
  // an await, and the stream is stopped when the dialog closes or the direction changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
        if (!cancelled) setState({ kind: "error", message: "Live camera isn't available here. You can take or choose a photo instead." });
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (cancelled) return;
        setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
        setState({ kind: "live" });
      } catch (error) {
        if (!cancelled) setState({ kind: "error", message: cameraErrorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing, attempt, stop]);

  // Free the preview object URL when it's replaced or the dialog closes.
  useEffect(() => {
    return () => {
      if (state.kind === "preview") URL.revokeObjectURL(state.url);
    };
  }, [state]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the selfie camera so the photo matches what the person saw.
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        stop();
        setState({ kind: "preview", url: URL.createObjectURL(blob), blob });
      },
      "image/jpeg",
      0.9,
    );
  }

  function usePhoto() {
    if (state.kind !== "preview") return;
    const file = new File([state.blob], `photo-${new Date().toISOString().replace(/[:.]/g, "-")}.jpg`, { type: "image/jpeg" });
    onCapture(file);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setState({ kind: "starting" });
        onOpenChange(next);
      }}
    >
      <DialogContent title="Take a photo" size="lg">
        <div className="space-y-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
            {/* The video stays mounted so a retake can re-attach the stream immediately. */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${state.kind === "live" ? "" : "opacity-0"}`}
              aria-label="Camera preview"
            />
            {state.kind === "preview" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={state.url} alt="Photo preview" className="absolute inset-0 size-full bg-black object-contain" />
            ) : null}
            {state.kind === "starting" ? (
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <Spinner label="Starting camera" />
              </div>
            ) : null}
          </div>

          {state.kind === "error" ? <Alert tone="warning">{state.message}</Alert> : null}

          <input
            ref={fallbackRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                onCapture(file);
                onOpenChange(false);
              }
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => fallbackRef.current?.click()}>
              <ImagePlus /> Choose a photo instead
            </Button>
            <div className="flex gap-2">
              {state.kind === "live" && canSwitch ? (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => {
                    setState({ kind: "starting" });
                    setFacing((f) => (f === "environment" ? "user" : "environment"));
                  }}
                  aria-label="Switch camera"
                >
                  <SwitchCamera />
                </Button>
              ) : null}
              {state.kind === "preview" ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setState({ kind: "starting" });
                      setAttempt((n) => n + 1);
                    }}
                  >
                    <RefreshCcw /> Retake
                  </Button>
                  <Button onClick={usePhoto}>Use photo</Button>
                </>
              ) : (
                <Button onClick={capture} disabled={state.kind !== "live"}>
                  <Camera /> Capture
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
