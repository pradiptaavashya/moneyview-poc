import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const API_URL = import.meta.env.VITE_API_URL;
const FRAME_RATE = 4; // 4fps capture
const CHALLENGE_TIMEOUT = 5000; // 5 seconds
const CLIENT_YAW_THRESHOLD = -20; // degrees for "left"

interface HeadTurnChallengeProps {
  sessionId: string;
  createdAt: string;
  onComplete: (passed: boolean, score: number) => void;
}

// Simple Lottie animation data for head turn left instruction
const headTurnLeftAnimation = {
  v: "5.5.7",
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 200,
  nm: "head-turn-left",
  layers: [
    {
      ty: 4,
      nm: "arrow",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 1, k: [
          { t: 0, s: [120, 100, 0], e: [80, 100, 0] },
          { t: 30, s: [80, 100, 0], e: [120, 100, 0] },
          { t: 60, s: [120, 100, 0] },
        ]},
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "sh", ks: { a: 0, k: { c: false, v: [[0, -20], [-20, 0], [0, 20]], i: [[0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0]] } } },
            { ty: "st", c: { a: 0, k: [1, 1, 1, 1] }, w: { a: 0, k: 4 } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
      ],
      ip: 0,
      op: 60,
    },
  ],
};

export function HeadTurnChallenge({ sessionId, createdAt, onComplete }: HeadTurnChallengeProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const capturedFrames = useRef<{ image: string; timestamp: number }[]>([]);
  const animationFrameRef = useRef<number>(0);
  const lastCaptureRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<"loading" | "active" | "validating" | "done">("loading");
  const [clientDetected, setClientDetected] = useState(false);
  const [currentYaw, setCurrentYaw] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  const initFaceLandmarker = useCallback(async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
    });
    faceLandmarkerRef.current = landmarker;
  }, []);

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 640, height: 480 },
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
  }, []);

  const processFrame = useCallback(() => {
    if (status !== "active") return;

    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);

    if (result.facialTransformationMatrixes?.length) {
      const matrix = result.facialTransformationMatrixes[0].data;
      // Extract yaw from rotation matrix (approximate)
      const yaw = Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI);
      setCurrentYaw(yaw);

      if (yaw <= CLIENT_YAW_THRESHOLD) {
        setClientDetected(true);
      }

      // Capture at 4fps
      if (now - lastCaptureRef.current >= 1000 / FRAME_RATE) {
        lastCaptureRef.current = now;
        const frameData = captureFrame();
        if (frameData) {
          capturedFrames.current.push({ image: frameData, timestamp: Date.now() });
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [status, captureFrame]);

  const submitFrames = useCallback(async () => {
    setStatus("validating");

    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          createdAt,
          challengeType: "head-left",
          frames: capturedFrames.current.slice(-12), // Send last ~3 seconds at 4fps
        }),
      });
      const data = await res.json();

      if (data.passed) {
        onComplete(true, data.bestScore);
      } else {
        setHint(data.hint || "Turn your head further to the left");
        onComplete(false, data.bestScore ?? 0);
      }
    } catch {
      setHint("Validation failed. Please try again.");
      onComplete(false, 0);
    }

    setStatus("done");
  }, [sessionId, createdAt, onComplete]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      await initFaceLandmarker();
      await startCamera();
      if (mounted) {
        setStatus("active");
        timerRef.current = setTimeout(() => {
          submitFrames();
        }, CHALLENGE_TIMEOUT);
      }
    }

    init();

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animationFrameRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [initFaceLandmarker, startCamera, submitFrames]);

  useEffect(() => {
    if (status === "active") {
      animationFrameRef.current = requestAnimationFrame(processFrame);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [status, processFrame]);

  // Auto-submit early if client detects sustained head turn
  useEffect(() => {
    if (clientDetected && status === "active" && capturedFrames.current.length >= 3) {
      if (timerRef.current) clearTimeout(timerRef.current);
      submitFrames();
    }
  }, [clientDetected, status, submitFrames]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
    >
      {/* Progress indicator */}
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-sm text-gray-400">Challenge 1 of 1</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
        </div>
      </div>

      {/* Instruction */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-800">
        <div className="w-12 h-12">
          <Lottie animationData={headTurnLeftAnimation} loop />
        </div>
        <div>
          <p className="text-white font-medium text-sm">Turn your head left</p>
          <p className="text-xs text-gray-500">Hold the position briefly</p>
        </div>
      </div>

      {/* Camera feed with oval overlay */}
      <div className="relative aspect-[3/4] bg-gray-950">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Oval overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-56 h-72 rounded-full border-4 transition-colors duration-300 ${
              clientDetected ? "border-green-400" : "border-white/30"
            }`}
          />
        </div>

        {/* Green checkmark when detected */}
        {clientDetected && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-4 right-4 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center"
          >
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}

        {/* Loading overlay */}
        {status === "loading" && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        )}

        {/* Validating overlay */}
        {status === "validating" && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-2" />
              <p className="text-sm text-gray-300">Validating...</p>
            </div>
          </div>
        )}

        {/* Yaw indicator */}
        {status === "active" && (
          <div className="absolute bottom-4 left-4 bg-black/60 rounded-lg px-3 py-1.5">
            <p className="text-xs text-gray-300">
              Yaw: {currentYaw.toFixed(1)}°
            </p>
          </div>
        )}
      </div>

      {/* Hint / status */}
      {hint && (
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-sm text-yellow-400">{hint}</p>
        </div>
      )}
    </motion.div>
  );
}
