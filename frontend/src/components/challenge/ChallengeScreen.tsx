import { useState, useEffect, useRef, useCallback } from "react";
import type { ChallengeType } from "./types";

const API_URL = import.meta.env.VITE_API_URL;
const FRAME_RATE = 4;
const DEFAULT_TIMEOUT_S = 8;

interface ChallengeScreenProps {
  sessionId: string;
  createdAt: string;
  challengeType: ChallengeType;
  currentIndex: number;
  totalChallenges: number;
  timeWindow?: number;
  stream?: MediaStream | null;
  onComplete: (passed: boolean, score: number, hint: string | null) => void;
}

const CHALLENGE_LABELS: Record<ChallengeType, string> = {
  "head-left": "Turn your head left",
  "head-right": "Turn your head right",
  "head-up": "Tilt your head up",
  "head-down": "Tilt your head down",
  smile: "Smile",
  "mouth-open": "Open your mouth",
};

const CLIENT_THRESHOLDS: Record<ChallengeType, (yaw: number, pitch: number) => boolean> = {
  "head-left": (yaw) => yaw <= -10,
  "head-right": (yaw) => yaw >= 10,
  "head-up": (_yaw, pitch) => pitch >= 10,
  "head-down": (_yaw, pitch) => pitch <= -10,
  smile: () => false,
  "mouth-open": () => false,
};

export function ChallengeScreen({
  sessionId,
  createdAt,
  challengeType,
  currentIndex,
  totalChallenges,
  timeWindow,
  stream: sharedStream,
  onComplete,
}: ChallengeScreenProps) {
  const challengeTimeout = (timeWindow ?? DEFAULT_TIMEOUT_S) * 1000;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capturedFrames = useRef<{ image: string; timestamp: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastCaptureRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "active" | "validating">("loading");
  const [clientDetected, setClientDetected] = useState(false);

  const submitFrames = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setStatus("validating");

    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          createdAt,
          challengeType,
          frames: capturedFrames.current.slice(-12),
        }),
      });
      const data = await res.json();
      onComplete(data.passed, data.bestScore ?? 0, data.hint ?? null);
    } catch {
      onComplete(false, 0, "Validation failed");
    }
  }, [sessionId, createdAt, challengeType, onComplete]);

  useEffect(() => {
    let mounted = true;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => { facialTransformationMatrixes?: { data: number[] }[] } } | null = null;

    async function init() {
      // Start camera immediately — don't wait for MediaPipe
      try {
        const stream = sharedStream && sharedStream.active
          ? sharedStream
          : await navigator.mediaDevices.getUserMedia({
              video: { facingMode: "user", width: 640, height: 480 },
            });
        if (videoRef.current && mounted) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("active");
          timerRef.current = setTimeout(submitFrames, challengeTimeout);
          startProcessing(null);
        }
      } catch {
        if (mounted) onComplete(false, 0, "Could not access camera");
        return;
      }

      // Load MediaPipe in background for visual feedback (non-blocking)
      try {
        const mp = await import("@mediapipe/tasks-vision");
        const FilesetResolver = mp.FilesetResolver;
        const FaceLandmarker = mp.FaceLandmarker;
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
        });
      } catch {
        // MediaPipe not available — visual feedback disabled, server still validates
      }
    }

    function startProcessing(lm: typeof landmarker) {
      function processFrame() {
        const video = videoRef.current;
        if (!video || video.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const now = performance.now();

        if (lm) {
          try {
            const result = lm.detectForVideo(video, now);
            if (result.facialTransformationMatrixes?.length) {
              const matrix = result.facialTransformationMatrixes[0].data;
              const yaw = Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI);
              const pitch = Math.asin(-matrix[4]) * (180 / Math.PI);
              const check = CLIENT_THRESHOLDS[challengeType];
              if (check(yaw, pitch)) {
                setClientDetected(true);
              }
            }
          } catch {
            // Ignore detection errors
          }
        }

        if (now - lastCaptureRef.current >= 1000 / FRAME_RATE) {
          lastCaptureRef.current = now;
          const canvas = canvasRef.current;
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const data = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
              capturedFrames.current.push({ image: data, timestamp: Date.now() });
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(processFrame);
      }
      animFrameRef.current = requestAnimationFrame(processFrame);
    }

    init();

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      // Only stop tracks if we created our own stream (not the shared recorder stream)
      const activeStream = videoRef.current?.srcObject as MediaStream | null;
      if (activeStream && activeStream !== sharedStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [submitFrames, challengeType, onComplete, sharedStream]);


  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm text-gray-400">
          Challenge {currentIndex + 1} of {totalChallenges}
        </span>
        <div className="flex gap-1.5">
          {Array.from({ length: totalChallenges }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < currentIndex
                  ? "bg-green-500"
                  : i === currentIndex
                    ? "bg-indigo-500"
                    : "bg-gray-700"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-800">
        <div className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-900/50">
          <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </div>
        <div>
          <p className="text-white font-medium text-sm">
            {CHALLENGE_LABELS[challengeType]}
          </p>
          <p className="text-xs text-gray-500">Hold the position briefly</p>
        </div>
      </div>

      <div className="relative aspect-[3/4] bg-gray-950">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-56 h-72 rounded-full border-4 transition-colors duration-300 ${
              clientDetected ? "border-green-400" : "border-white/30"
            }`}
          />
        </div>

        {clientDetected && (
          <div className="absolute top-4 right-4 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {status === "loading" && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Starting camera...</p>
            </div>
          </div>
        )}

        {status === "validating" && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-300">Validating...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
