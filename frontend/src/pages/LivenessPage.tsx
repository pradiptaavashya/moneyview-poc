import { motion } from "framer-motion";

export function LivenessPage() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-56px)] p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[480px]"
      >
        {/* Dark camera background container — ready for camera feed in later slices */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="aspect-[3/4] bg-gray-950 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-3 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">Camera feed will appear here</p>
              <p className="text-xs text-gray-600 mt-1">
                Liveness detection coming in next slice
              </p>
            </div>
          </div>
          <div className="p-4 border-t border-gray-800">
            <button
              disabled
              className="w-full py-2.5 rounded-lg bg-indigo-600/50 text-white/70 text-sm font-medium cursor-not-allowed"
            >
              Start Liveness Check (Coming Soon)
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
