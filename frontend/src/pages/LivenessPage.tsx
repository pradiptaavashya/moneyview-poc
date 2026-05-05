import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaceLivenessDetector } from "@aws-amplify/ui-react-liveness";
import { useAuthContext } from "../hooks/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

type Stage =
  | "permission-check"
  | "liveness"
  | "loading-results"
  | "result"
  | "error";

interface LivenessResult {
  score: number;
  passed: boolean;
  threshold: number;
}

export function LivenessPage() {
  const { user } = useAuthContext();
  const [stage, setStage] = useState<Stage>("permission-check");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<
    "prompt" | "granted" | "denied"
  >("prompt");
  const [lightingWarning, setLightingWarning] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        setCameraPermission("granted");
      })
      .catch(() => {
        setCameraPermission("denied");
      });
  }, []);

  const checkLighting = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const avgBrightness = totalBrightness / (data.length / 4);

      stream.getTracks().forEach((t) => t.stop());
      return avgBrightness > 50;
    } catch {
      return true;
    }
  }, []);

  const startSession = useCallback(async () => {
    setError(null);

    const bright = await checkLighting();
    if (!bright) {
      setLightingWarning(true);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");
      setSessionId(data.sessionId);
      setStage("liveness");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setStage("error");
    }
  }, [checkLighting, user]);

  const handleAnalysisComplete = useCallback(async () => {
    if (!sessionId) return;
    setStage("loading-results");

    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get results");
      setResult({ score: data.score, passed: data.passed, threshold: data.threshold });
      setStage("result");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to get results");
      setStage("error");
    }
  }, [sessionId]);

  const handleRetry = () => {
    setSessionId(null);
    setResult(null);
    setError(null);
    setLightingWarning(false);
    setStage("permission-check");
  };

  if (cameraPermission === "denied") {
    return <CameraPermissionDenied onRetry={() => setCameraPermission("prompt")} />;
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-4">
      <div className="w-full max-w-[480px]">
        <AnimatePresence mode="wait">
          {stage === "permission-check" && (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6"
            >
              <h2 className="text-lg font-semibold text-white mb-2">
                Face Liveness Check
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                Position your face within the oval and follow the on-screen
                prompts. Colored lights will flash briefly.
              </p>

              {lightingWarning && (
                <div className="mb-4 p-3 rounded-lg bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-sm">
                  Move to a brighter area for better results.
                </div>
              )}

              <button
                onClick={startSession}
                className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
              >
                Start Liveness Check
              </button>
            </motion.div>
          )}

          {stage === "liveness" && sessionId && (
            <motion.div
              key="liveness"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden"
            >
              <FaceLivenessDetector
                sessionId={sessionId}
                region="ap-south-1"
                onAnalysisComplete={handleAnalysisComplete}
                onError={(err) => {
                  setError(err.error.message);
                  setStage("error");
                }}
              />
            </motion.div>
          )}

          {stage === "loading-results" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center"
            >
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4" />
              <p className="text-sm text-gray-400">Analyzing results...</p>
            </motion.div>
          )}

          {stage === "result" && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center"
            >
              <div
                className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  result.passed ? "bg-green-900/50" : "bg-red-900/50"
                }`}
              >
                {result.passed ? (
                  <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>

              <h2 className="text-xl font-semibold text-white mb-1">
                {result.passed ? "Liveness Verified" : "Liveness Check Failed"}
              </h2>
              <p className="text-sm text-gray-400 mb-4">
                Confidence: {result.score.toFixed(1)}% (threshold: {result.threshold}%)
              </p>

              <button
                onClick={handleRetry}
                className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </motion.div>
          )}

          {stage === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/50 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-white mb-1">Error</h2>
              <p className="text-sm text-gray-400 mb-4">{error}</p>
              <button
                onClick={handleRetry}
                className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CameraPermissionDenied({ onRetry }: { onRetry: () => void }) {
  const isChrome = navigator.userAgent.includes("Chrome");
  const isSafari =
    navigator.userAgent.includes("Safari") &&
    !navigator.userAgent.includes("Chrome");
  const isFirefox = navigator.userAgent.includes("Firefox");

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[480px] bg-gray-900 rounded-xl border border-gray-800 p-6"
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-yellow-900/50 flex items-center justify-center">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>

        <h2 className="text-xl font-semibold text-white text-center mb-2">
          Camera Access Required
        </h2>
        <p className="text-sm text-gray-400 text-center mb-6">
          Please enable camera access to continue with the liveness check.
        </p>

        <div className="bg-gray-800 rounded-lg p-4 text-sm text-gray-300 space-y-2">
          {isChrome && (
            <>
              <p>1. Click the camera icon in the address bar</p>
              <p>2. Select "Always allow" for this site</p>
              <p>3. Click "Done" and refresh the page</p>
            </>
          )}
          {isSafari && (
            <>
              <p>1. Go to Safari &gt; Settings &gt; Websites &gt; Camera</p>
              <p>2. Find this website and select "Allow"</p>
              <p>3. Refresh the page</p>
            </>
          )}
          {isFirefox && (
            <>
              <p>1. Click the camera icon in the address bar</p>
              <p>2. Remove the blocked permission</p>
              <p>3. Refresh the page</p>
            </>
          )}
          {!isChrome && !isSafari && !isFirefox && (
            <>
              <p>1. Open your browser settings</p>
              <p>2. Find camera permissions for this site</p>
              <p>3. Allow camera access and refresh</p>
            </>
          )}
        </div>

        <button
          onClick={onRetry}
          className="w-full mt-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          I've Enabled Camera Access
        </button>
      </motion.div>
    </div>
  );
}
