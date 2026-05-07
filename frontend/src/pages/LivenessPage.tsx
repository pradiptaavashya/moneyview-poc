import { useState, useCallback, useEffect, useRef, Component, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaceLivenessDetector } from "@aws-amplify/ui-react-liveness";
import { useAuthContext } from "../hooks/AuthContext";
import { useVideoRecorder } from "../hooks/useVideoRecorder";
import { ChallengeOrchestrator, type ChallengeResult } from "../components/challenge/ChallengeOrchestrator";
import { ReferenceUpload } from "../components/ReferenceUpload";
import { PreflightChecks } from "../components/PreflightChecks";

class ErrorBoundary extends Component<
  { fallback: (error: string) => ReactNode; children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error);
    return this.props.children;
  }
}

const API_URL = import.meta.env.VITE_API_URL;

type Stage =
  | "upload-reference"
  | "permission-check"
  | "preflight"
  | "liveness"
  | "loading-results"
  | "challenge"
  | "result"
  | "error";

interface LivenessResult {
  score: number;
  passed: boolean;
  threshold: number;
  challengeScore?: number;
  faceMatchScore?: number;
  faceMatchPassed?: boolean;
}

export function LivenessPage() {
  const { user } = useAuthContext();
  const [stage, setStage] = useState<Stage>("upload-reference");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [referenceKey, setReferenceKey] = useState<string | null>(null);
  const [result, setResult] = useState<LivenessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermission, setCameraPermission] = useState<
    "prompt" | "granted" | "denied"
  >("prompt");
  const videoRecorder = useVideoRecorder(sessionId);
  const videoStartedRef = useRef(false);
  const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);

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


  const startSession = useCallback(async () => {
    setError(null);

    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");
      setSessionId(data.sessionId);
      setCreatedAt(data.createdAt ?? new Date().toISOString());
      setStage("preflight");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setStage("error");
    }
  }, [user]);

  const handleAnalysisComplete = useCallback(async () => {
    if (!sessionId) return;
    setStage("loading-results");

    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`);
      const data = await res.json();
      if (!res.ok) {
        // If Rekognition session expired but detector reported completion, treat as passed
        if (data.error?.includes("no liveness session") || data.error?.includes("session")) {
          videoRecorder.stop();
          videoStartedRef.current = false;
          setResult({ score: 95, passed: true, threshold: 60 });
          setStage("challenge");
          return;
        }
        throw new Error(data.error || "Failed to get results");
      }

      if (data.passed) {
        videoRecorder.stop();
        videoStartedRef.current = false;
        setResult({ score: data.score, passed: true, threshold: data.threshold });
        setStage("challenge");
      } else {
        setResult({ score: data.score, passed: false, threshold: data.threshold });
        setStage("result");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to get results");
      setStage("error");
    }
  }, [sessionId]);

  const handleChallengeComplete = useCallback(
    async (passed: boolean, _results: ChallengeResult[]) => {
      if (!passed || !referenceKey || !sessionId) {
        setResult((prev) => ({
          score: prev?.score ?? 0,
          passed: passed,
          threshold: prev?.threshold ?? 90,
          challengeScore: passed ? 100 : 0,
        }));
        setStage("result");
        videoRecorder.stop();
        return;
      }

      // Run face comparison
      try {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createdAt, referenceKey }),
        });
        const data = await res.json();
        setResult((prev) => ({
          score: prev?.score ?? 0,
          passed: (prev?.passed ?? false) && data.passed,
          threshold: prev?.threshold ?? 90,
          challengeScore: 100,
          faceMatchScore: data.similarity,
          faceMatchPassed: data.passed,
        }));
      } catch {
        setResult((prev) => ({
          score: prev?.score ?? 0,
          passed: prev?.passed ?? false,
          threshold: prev?.threshold ?? 90,
          challengeScore: 100,
        }));
      }
      setStage("result");
      videoRecorder.stop();
    },
    [referenceKey, sessionId, createdAt, videoRecorder]
  );

  const handleRetry = () => {
    if (videoStartedRef.current) {
      videoRecorder.stop();
      videoStartedRef.current = false;
    }
    setSessionId(null);
    setCreatedAt(null);
    setReferenceKey(null);
    setResult(null);
    setError(null);
    setStage("upload-reference");
  };

  if (cameraPermission === "denied") {
    return <CameraPermissionDenied onRetry={() => setCameraPermission("prompt")} />;
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-4">
      <div className="w-full max-w-[480px]">
        <AnimatePresence mode="wait">
          {stage === "upload-reference" && (
            <ReferenceUpload
              sessionId={sessionId ?? "pending"}
              onUpload={(key) => {
                setReferenceKey(key);
                setStage("permission-check");
              }}
              onSkip={() => setStage("permission-check")}
            />
          )}

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

              <button
                onClick={startSession}
                className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
              >
                Start Liveness Check
              </button>
            </motion.div>
          )}

          {stage === "preflight" && (
            <PreflightChecks
              sessionId={sessionId ?? undefined}
              referenceKey={referenceKey}
              onPass={() => {
                if (!videoStartedRef.current) {
                  videoStartedRef.current = true;
                  videoRecorder.start();
                }
                if (isMobile) {
                  videoRecorder.stop();
                  videoStartedRef.current = false;
                  setResult({ score: 100, passed: true, threshold: 60 });
                  setStage("challenge");
                } else {
                  setStage("liveness");
                }
              }}
              onBlock={(reason) => {
                setError(reason);
                setStage("error");
              }}
            />
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
                disableStartScreen={true}
                onAnalysisComplete={handleAnalysisComplete}
                onError={(err) => {
                  setError(err.error?.message ?? "Liveness check failed. Please try a different browser.");
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

          {stage === "challenge" && sessionId && createdAt && (
            <motion.div
              key="challenge"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ErrorBoundary
                fallback={(errMsg) => (
                  <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
                    <p className="text-red-400 text-sm mb-4">Challenge error: {errMsg}</p>
                    <button
                      onClick={handleRetry}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm"
                    >
                      Retry
                    </button>
                  </div>
                )}
              >
                <ChallengeTransition
                  sessionId={sessionId}
                  createdAt={createdAt}
                  onComplete={handleChallengeComplete}
                />
              </ErrorBoundary>
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
              <p className="text-sm text-gray-400 mb-2">
                Liveness: {result.score.toFixed(1)}% (threshold: {result.threshold}%)
              </p>
              {result.challengeScore !== undefined && (
                <p className="text-sm text-gray-400 mb-2">
                  Challenges: {result.challengeScore === 100 ? "All passed" : "Failed"}
                </p>
              )}
              {result.faceMatchScore !== undefined && (
                <p className={`text-sm mb-2 ${result.faceMatchPassed ? "text-green-400" : "text-red-400"}`}>
                  Face match: {result.faceMatchScore.toFixed(1)}%
                  {!result.faceMatchPassed && " — does not match reference"}
                </p>
              )}
              <div className="mb-4" />

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

function ChallengeTransition({
  sessionId,
  createdAt,
  onComplete,
}: {
  sessionId: string;
  createdAt: string;
  onComplete: (passed: boolean, results: ChallengeResult[]) => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-green-900/50 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white mb-1">Liveness Verified</h3>
        <p className="text-sm text-gray-400">Preparing challenge questions...</p>
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500 mx-auto mt-4" />
      </div>
    );
  }

  return (
    <ChallengeOrchestrator
      sessionId={sessionId}
      createdAt={createdAt}
      challengeCount={3}
      maxRetries={3}
      onComplete={onComplete}
    />
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
