import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useAuthContext } from "../hooks/AuthContext";

const API_URL = import.meta.env.VITE_API_URL;

interface Analytics {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  passRate: string;
  challengesPassed: number;
  faceMatches: number;
  last24h: number;
  last7d: number;
  avgScore: string;
}

interface Session {
  sessionId: string;
  userId?: string;
  createdAt?: string;
  livenessResult?: string;
  livenessScore?: number;
  faceMatchPassed?: boolean;
  faceMatchScore?: number;
}

export function AdminDashboardPage() {
  const { isAdmin } = useAuthContext();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [analyticsRes, sessionsRes] = await Promise.all([
        fetch(`${API_URL}/analytics`),
        fetch(`${API_URL}/sessions?limit=50`),
      ]);
      const analyticsData = await analyticsRes.json();
      const sessionsData = await sessionsRes.json();
      setAnalytics(analyticsData);
      setSessions(sessionsData.sessions ?? []);
    } catch {
      // Non-blocking
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const playVideo = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/video-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get" }),
      });
      const data = await res.json();
      if (data.url) {
        setVideoUrl(data.url);
        setSelectedSession(sessionId);
      }
    } catch {
      // Non-blocking
    }
  };

  const exportCsv = () => {
    window.open(`${API_URL}/sessions/export?format=csv`, "_blank");
  };

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <button
            onClick={exportCsv}
            className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm text-white transition-colors"
          >
            Export CSV
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
          </div>
        ) : (
          <>
            {analytics && (
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-5 mb-8">
                <StatCard label="Total Sessions" value={String(analytics.total)} />
                <StatCard label="Last 24h" value={String(analytics.last24h)} />
                <StatCard label="Last 7d" value={String(analytics.last7d)} />
                <StatCard label="Pass Rate" value={`${analytics.passRate}%`} color="green" />
                <StatCard label="Avg Score" value={`${analytics.avgScore}%`} />
                <StatCard label="Passed" value={String(analytics.passed)} color="green" />
                <StatCard label="Failed" value={String(analytics.failed)} color="red" />
                <StatCard label="Challenges OK" value={String(analytics.challengesPassed)} />
                <StatCard label="Face Matches" value={String(analytics.faceMatches)} />
                <StatCard label="Pending" value={String(analytics.pending)} color="yellow" />
              </div>
            )}

            <h2 className="text-lg font-medium text-white mb-3">Recent Sessions</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-400 border-b border-gray-800">
                  <tr>
                    <th className="pb-2 pr-4">Session ID</th>
                    <th className="pb-2 pr-4">User</th>
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Result</th>
                    <th className="pb-2 pr-4">Score</th>
                    <th className="pb-2">Video</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {sessions.map((s) => (
                    <tr key={s.sessionId} className="border-b border-gray-800/50">
                      <td className="py-2 pr-4 font-mono text-xs">
                        {s.sessionId.slice(0, 8)}...
                      </td>
                      <td className="py-2 pr-4">{s.userId ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <ResultBadge result={s.livenessResult} />
                      </td>
                      <td className="py-2 pr-4">
                        {s.livenessScore != null
                          ? `${s.livenessScore.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => playVideo(s.sessionId)}
                          className="text-indigo-400 hover:text-indigo-300 text-xs"
                        >
                          Play
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sessions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        No sessions yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {videoUrl && selectedSession && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 max-w-lg w-full">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white">
                  Session: {selectedSession.slice(0, 12)}...
                </h3>
                <button
                  onClick={() => {
                    setVideoUrl(null);
                    setSelectedSession(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <video
                src={videoUrl}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
              />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "red" | "yellow";
}) {
  const colorClass =
    color === "green"
      ? "text-green-400"
      : color === "red"
        ? "text-red-400"
        : color === "yellow"
          ? "text-yellow-400"
          : "text-white";

  return (
    <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`text-xl font-semibold ${colorClass}`}>{value}</p>
    </div>
  );
}

function ResultBadge({ result }: { result?: string }) {
  if (result === "passed")
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-green-900/50 text-green-400">
        Passed
      </span>
    );
  if (result === "failed")
    return (
      <span className="px-2 py-0.5 rounded text-xs bg-red-900/50 text-red-400">
        Failed
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">
      Pending
    </span>
  );
}
