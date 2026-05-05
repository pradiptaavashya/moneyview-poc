import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChallengeScreen } from "./ChallengeScreen";

export type ChallengeType =
  | "head-left"
  | "head-right"
  | "head-up"
  | "head-down"
  | "smile"
  | "mouth-open";

const HEAD_MOVEMENTS: ChallengeType[] = ["head-left", "head-right", "head-up", "head-down"];
const EXPRESSIONS: ChallengeType[] = ["smile", "mouth-open"];

interface ChallengeOrchestratorProps {
  sessionId: string;
  createdAt: string;
  challengeCount?: number;
  maxRetries?: number;
  onComplete: (passed: boolean, results: ChallengeResult[]) => void;
}

export interface ChallengeResult {
  type: ChallengeType;
  passed: boolean;
  score: number;
}

function selectChallenges(count: number): ChallengeType[] {
  const shuffled = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

  // Guarantee at least 1 head movement and 1 expression
  const headPick = shuffled(HEAD_MOVEMENTS)[0];
  const exprPick = shuffled(EXPRESSIONS)[0];

  const remaining = [...HEAD_MOVEMENTS, ...EXPRESSIONS].filter(
    (c) => c !== headPick && c !== exprPick
  );
  const extras = shuffled(remaining).slice(0, count - 2);

  return shuffled([headPick, exprPick, ...extras]);
}

export function ChallengeOrchestrator({
  sessionId,
  createdAt,
  challengeCount = 3,
  maxRetries = 3,
  onComplete,
}: ChallengeOrchestratorProps) {
  const [challenges, setChallenges] = useState<ChallengeType[]>(() =>
    selectChallenges(challengeCount)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ChallengeResult[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showFailure, setShowFailure] = useState(false);
  const [failHint, setFailHint] = useState<string | null>(null);

  const totalChallenges = challenges.length;
  const currentChallenge = challenges[currentIndex];

  const handleChallengeComplete = useCallback(
    (passed: boolean, score: number, hint: string | null) => {
      const result: ChallengeResult = {
        type: currentChallenge,
        passed,
        score,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (!passed) {
        setFailHint(hint);
        setShowFailure(true);
        return;
      }

      if (currentIndex < totalChallenges - 1) {
        // Show success transition, then next challenge
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setCurrentIndex((i) => i + 1);
        }, 1000);
      } else {
        // All challenges complete
        onComplete(true, newResults);
      }
    },
    [currentChallenge, currentIndex, totalChallenges, results, onComplete]
  );

  const handleRetry = useCallback(() => {
    if (retryCount >= maxRetries - 1) {
      onComplete(false, results);
      return;
    }
    setRetryCount((r) => r + 1);
    setChallenges(selectChallenges(challengeCount));
    setCurrentIndex(0);
    setResults([]);
    setShowFailure(false);
    setFailHint(null);
  }, [retryCount, maxRetries, challengeCount, results, onComplete]);

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {showSuccess && (
          <motion.div
            key="success-transition"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-3 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-white">Success!</p>
          </motion.div>
        )}

        {showFailure && (
          <motion.div
            key="failure"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center"
          >
            <div className="w-16 h-16 mx-auto mb-3 bg-red-900/50 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-white mb-1">Challenge Failed</p>
            {failHint && <p className="text-sm text-gray-400 mb-4">{failHint}</p>}
            <p className="text-xs text-gray-500 mb-4">
              Retry {retryCount + 1} of {maxRetries}
            </p>
            <button
              onClick={handleRetry}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              {retryCount >= maxRetries - 1 ? "View Results" : "Retry All Challenges"}
            </button>
          </motion.div>
        )}

        {!showSuccess && !showFailure && (
          <motion.div
            key={`challenge-${currentIndex}-${retryCount}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <ChallengeScreen
              sessionId={sessionId}
              createdAt={createdAt}
              challengeType={currentChallenge}
              currentIndex={currentIndex}
              totalChallenges={totalChallenges}
              onComplete={handleChallengeComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
