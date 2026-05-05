import { motion } from "framer-motion";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuthContext } from "../hooks/AuthContext";

export function AdminPage() {
  const { isAdmin } = useAuthContext();
  const navigate = useNavigate();

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-semibold text-white mb-6">Admin Panel</h1>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <button
            onClick={() => navigate("/admin/dashboard")}
            className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-left hover:border-indigo-500 transition-colors"
          >
            <h3 className="text-sm font-medium text-gray-400 mb-1">Dashboard</h3>
            <p className="text-2xl font-semibold text-white">Sessions & Analytics</p>
            <p className="text-xs text-gray-500 mt-1">View sessions, stats, and playback</p>
          </button>
          <button
            onClick={() => navigate("/admin/config")}
            className="bg-gray-900 rounded-xl p-5 border border-gray-800 text-left hover:border-indigo-500 transition-colors"
          >
            <h3 className="text-sm font-medium text-gray-400 mb-1">Configuration</h3>
            <p className="text-2xl font-semibold text-white">Tune</p>
            <p className="text-xs text-gray-500 mt-1">Adjust thresholds and parameters</p>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
