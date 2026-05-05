import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import Lottie from "lottie-react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import type { ChallengeType } from "./ChallengeOrchestrator";

const API_URL = import.meta.env.VITE_API_URL;
const FRAME_RATE = 4;
const CHALLENGE_TIMEOUT = 5000;

interface ChallengeScreenProps {
  sessionId: string;
  createdAt: string;
  challengeType: ChallengeType;
  currentIndex: number;
  totalChallenges: number;
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
  "head-left": (yaw) => yaw <= -18,
  "head-right": (yaw) => yaw >= 18,
  "head-up": (_yaw, pitch) => pitch >= 15,
  "head-down": (_yaw, pitch) => pitch <= -15,
  smile: () => false, // can't reliably detect smile from landmarks alone
  "mouth-open": () => false,
};

function makeLottieAnimation(challengeType: ChallengeType) {
  const arrows: Record<string, number[][]> = {
    "head-left": [[-1, 0]],
    "head-right": [[1, 0]],
    "head-up": [[0, -1]],
    "head-down": [[0, 1]],
    smile: [],
    "mouth-open": [],
  };

  const dir = arrows[challengeType];
  if (!dir?.length) {
    // Simple pulse for expressions
    return {
      v: "5.5.7", fr: 30, ip: 0, op: 60, w: 80, h: 80, nm: challengeType,
      layers: [{
        ty: 4, nm: "circle", sr: 1,
        ks: {
          o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
          p: { a: 0, k: [40, 40, 0] }, a: { a: 0, k: [0, 0, 0] },
          s: { a: 1, k: [
            { t: 0, s: [100, 100, 100], e: [120, 120, 100] },
            { t: 30, s: [120, 120, 100], e: [100, 100, 100] },
            { t: 60, s: [100, 100, 100] },
          ]},
        },
        shapes: [{
          ty: "gr", it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [30, 30] } },
            { ty: "st", c: { a: 0, k: [1, 1, 1, 1] }, w: { a: 0, k: 3 } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        }],
        ip: 0, op: 60,
      }],
    };
  }

  const [dx, dy] = dir[0];
  return {
    v: "5.5.7", fr: 30, ip: 0, op: 60, w: 80, h: 80, nm: challengeType,
    layers: [{
      ty: 4, nm: "arrow", sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 1, k: [
          { t: 0, s: [40, 40, 0], e: [40 + dx * 15, 40 + dy * 15, 0] },
          { t: 30, s: [40 + dx * 15, 40 + dy * 15, 0], e: [40, 40, 0] },
          { t: 60, s: [40, 40, 0] },
        ]},
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      shapes: [{
        ty: "gr", it: [
          { ty: "sh", ks: { a: 0, k: { c: false, v: [[dx * -10, dy * -10 - 8], [dx * -10 + dx * -8, dy * -10], [dx * -10, dy * -10 + 8]], i: [[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0]] } } },
          { ty: "st", c: { a: 0, k: [1, 1, 1, 1] }, w: { a: 0, k: 3 } },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
        ],
      }],
      ip: 0, op: 60,
    }],
  };
}

export function ChallengeScreen({
  sessionId,
  createdAt,
  challengeType,
  currentIndex,
  totalChallenges,
  onComplete,
}: ChallengeScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const capturedFrames = useRef<{ image: string; timestamp: number }[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastCaptureRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const [status, setStatus] = useState<"loading" | "active" | "validating">("loading");
  const [clientDetected, setClientDetected] = useState(false);

  const lottieData = makeLottieAnimation(challengeType);

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

    async function init() {
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
        outputFacialTransformationMatrixes: true,
      });
      faceLandmarkerRef.current = landmarker;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      if (videoRef.current && mounted) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("active");
        timerRef.current = setTimeout(submitFrames, CHALLENGE_TIMEOUT);
      }
    }

    init();

    return () => {
      mounted = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [submitFrames]);

  const processFrame = useCallback(() => {
    if (status !== "active") return;
    const video = videoRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    const result = landmarker.detectForVideo(video, now);

    if (result.facialTransformationMatrixes?.length) {
      const matrix = result.facialTransformationMatrixes[0].data;
      const yaw = Math.atan2(matrix[8], matrix[0]) * (180 / Math.PI);
      const pitch = Math.asin(-matrix[4]) * (180 / Math.PI);

      const check = CLIENT_THRESHOLDS[challengeType];
      if (check(yaw, pitch)) {
        setClientDetected(true);
      }

      if (now - lastCaptureRef.current >= 1000 / FRAME_RATE) {
        lastCaptureRef.current = now;
        const canvas = canvasRef.current!;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(video, 0, 0);
        const data = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
        capturedFrames.current.push({ image: data, timestamp: Date.now() });
      }
    }

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [status, challengeType]);

  useEffect(() => {
    if (status === "active") {
      animFrameRef.current = requestAnimationFrame(processFrame);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [status, processFrame]);

  useEffect(() => {
    if (clientDetected && status === "active" && capturedFrames.current.length >= 3) {
      if (timerRef.current) clearTimeout(timerRef.current);
      submitFrames();
    }
  }, [clientDetected, status, submitFrames]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Progress */}
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

      {/* Instruction */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-800">
        <div className="w-10 h-10">
          <Lottie animationData={lottieData} loop />
        </div>
        <div>
          <p className="text-white font-medium text-sm">
            {CHALLENGE_LABELS[challengeType]}
          </p>
          <p className="text-xs text-gray-500">Hold the position briefly</p>
        </div>
      </div>

      {/* Camera */}
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

        {status === "loading" && (
          <div className="absolute inset-0 bg-gray-950/80 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
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
