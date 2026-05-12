import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../hooks/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

interface Config {
  livenessThreshold: number;
  headTurnAngle: number;
  smileThreshold: number;
  mouthOpenThreshold: number;
  consecutiveFrames: number;
  timeWindow: number;
  challengeCount: number;
  maxRetries: number;
  faceMatchThreshold: number;
  enabledChallenges: string[];
}

const CHALLENGE_OPTIONS = [
  { id: "head-left", label: "Head Left" },
  { id: "head-right", label: "Head Right" },
  { id: "head-up", label: "Head Up" },
  { id: "head-down", label: "Head Down" },
  { id: "smile", label: "Smile" },
  { id: "mouth-open", label: "Open Mouth" },
];

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}

function SliderField({ label, value, min, max, unit = "", onChange }: SliderFieldProps) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-300">{label}</span>
        <span className="text-white font-medium">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-gray-600">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  );
}

export function AdminConfigPage() {
  const { isAdmin, user } = useAuthContext();
  const [config, setConfig] = useState<Config | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  if (!isAdmin) return <Navigate to="/" replace />;
  if (!config) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, updatedBy: user?.email }),
      });
      if (res.ok) {
        setToast("Configuration saved");
        setTimeout(() => setToast(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof Config>(key: K, value: Config[K]) => {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  };

  const toggleChallenge = (id: string) => {
    const current = config.enabledChallenges;
    const next = current.includes(id)
      ? current.filter((c) => c !== id)
      : [...current, id];
    update("enabledChallenges", next);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-semibold text-white mb-6">Configuration</h1>

        <div className="space-y-6">
          {/* Liveness */}
          <Section title="Liveness Detection">
            <SliderField
              label="Confidence Threshold"
              value={config.livenessThreshold}
              min={50} max={99} unit="%"
              onChange={(v) => update("livenessThreshold", v)}
            />
            <SliderField
              label="Face Match Threshold"
              value={config.faceMatchThreshold}
              min={70} max={99} unit="%"
              onChange={(v) => update("faceMatchThreshold", v)}
            />
          </Section>

          {/* Challenges */}
          <Section title="Challenge Settings">
            <SliderField
              label="Head Turn Angle"
              value={config.headTurnAngle}
              min={10} max={45} unit="°"
              onChange={(v) => update("headTurnAngle", v)}
            />
            <SliderField
              label="Smile Confidence"
              value={config.smileThreshold}
              min={50} max={99} unit="%"
              onChange={(v) => update("smileThreshold", v)}
            />
            <SliderField
              label="Mouth Open Confidence"
              value={config.mouthOpenThreshold}
              min={50} max={99} unit="%"
              onChange={(v) => update("mouthOpenThreshold", v)}
            />
            <SliderField
              label="Consecutive Frames Required"
              value={config.consecutiveFrames}
              min={1} max={10}
              onChange={(v) => update("consecutiveFrames", v)}
            />
            <SliderField
              label="Time Window"
              value={config.timeWindow}
              min={3} max={12} unit="s"
              onChange={(v) => update("timeWindow", v)}
            />
            <SliderField
              label="Number of Challenges"
              value={config.challengeCount}
              min={1} max={6}
              onChange={(v) => update("challengeCount", v)}
            />
            <SliderField
              label="Max Retries"
              value={config.maxRetries}
              min={1} max={5}
              onChange={(v) => update("maxRetries", v)}
            />
          </Section>

          {/* Enabled Challenges */}
          <Section title="Enabled Challenges">
            <div className="grid grid-cols-2 gap-2">
              {CHALLENGE_OPTIONS.map((opt) => (
                <label
                  key={opt.id}
                  className="flex items-center gap-2 p-2 rounded-lg bg-gray-800 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={config.enabledChallenges.includes(opt.id)}
                    onChange={() => toggleChallenge(opt.id)}
                    className="rounded border-gray-600 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </Section>

          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>

        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-green-600 text-white text-sm"
          >
            {toast}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
      <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}
