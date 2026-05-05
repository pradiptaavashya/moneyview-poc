import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../hooks/AuthContext";

export function DashboardPage() {
  const { user, isAdmin } = useAuthContext();
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[480px] space-y-4"
      >
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-1">
            Welcome, {user?.email}
          </h2>
          <p className="text-sm text-gray-400 mb-6">
            Role: {user?.roles.join(", ")}
          </p>

          <button
            onClick={() => navigate("/liveness")}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Start Liveness Check
          </button>

          {isAdmin && (
            <button
              onClick={() => navigate("/admin")}
              className="w-full mt-3 py-3 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white font-medium transition-colors"
            >
              Admin Panel
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
