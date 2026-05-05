import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL;

interface PreflightResult {
  virtualCamera: boolean;
  headlessBrowser: boolean;
  screenSharing: boolean;
  multipleFaces: boolean;
  occluded: boolean;
}

interface PreflightChecksProps {
  onPass: () => void;
  onBlock: (reason: string) => void;
  referenceKey?: string | null;
  sessionId?: string;
}

const VIRTUAL_CAMERA_NAMES = [
  "obs virtual camera",
  "manycam",
  "snap camera",
  "xsplit",
  "droidcam",
  "iriun",
  "epoccam",
  "virtual",
  "fake",
];

function detectHeadlessBrowser(): boolean {
  const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
  if (isMobile) return false;
  if ((navigator as unknown as Record<string, unknown>).webdriver) return true;
  if (!navigator.languages || navigator.languages.length === 0) return true;
  if (navigator.plugins.length === 0) return true;
  return false;
}

async function detectVirtualCamera(): Promise<boolean> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === "videoinput");
    return videoInputs.some((d) =>
      VIRTUAL_CAMERA_NAMES.some((name) =>
        d.label.toLowerCase().includes(name)
      )
    );
  } catch {
    return false;
  }
}

async function detectScreenSharing(): Promise<boolean> {
  const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
  if (isMobile) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    stream.getTracks().forEach((t) => t.stop());
    return (settings as Record<string, unknown>).displaySurface !== undefined;
  } catch {
    return false;
  }
}

export function PreflightChecks({ onPass, onBlock, referenceKey, sessionId }: PreflightChecksProps) {
  const [checking, setChecking] = useState(true);
  const [results, setResults] = useState<PreflightResult | null>(null);
  const [watermarkBlocked, setWatermarkBlocked] = useState(false);

  const runChecks = useCallback(async () => {
    const virtualCamera = await detectVirtualCamera();
    if (virtualCamera) {
      onBlock("Virtual cameras are not supported. Please use your device's real camera.");
      return;
    }

    const headless = detectHeadlessBrowser();
    if (headless) {
      onBlock("Automated browsers are not supported.");
      return;
    }

    const screenShare = await detectScreenSharing();
    if (screenShare) {
      onBlock("Screen sharing detected. Please disable screen sharing.");
      return;
    }

    // Check reference document for AI watermarks (server-side)
    if (referenceKey && sessionId) {
      try {
        const res = await fetch(`${API_URL}/reference/check-watermark`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: referenceKey, sessionId }),
        });
        const data = await res.json();
        if (data.blocked) {
          setWatermarkBlocked(true);
          onBlock("AI-generated documents are not accepted.");
          return;
        }
      } catch {
        // Continue if watermark check fails
      }
    }

    setResults({
      virtualCamera: false,
      headlessBrowser: false,
      screenSharing: false,
      multipleFaces: false,
      occluded: false,
    });
    setChecking(false);
    onPass();
  }, [onPass, onBlock, referenceKey, sessionId]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  if (watermarkBlocked) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center"
    >
      {checking && (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4" />
          <p className="text-sm text-gray-400">Running security checks...</p>
        </>
      )}
      {!checking && results && (
        <div className="space-y-2 text-left">
          <CheckItem label="Real camera" passed={!results.virtualCamera} />
          <CheckItem label="Standard browser" passed={!results.headlessBrowser} />
          <CheckItem label="No screen sharing" passed={!results.screenSharing} />
        </div>
      )}
    </motion.div>
  );
}

function CheckItem({ label, passed }: { label: string; passed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {passed ? (
        <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className="text-sm text-gray-300">{label}</span>
    </div>
  );
}
