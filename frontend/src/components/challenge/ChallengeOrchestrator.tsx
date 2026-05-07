import { useState, useCallback } from "react";
import { ChallengeScreen } from "./ChallengeScreen";
import type { ChallengeType, ChallengeResult } from "./types";

export type { ChallengeType, ChallengeResult };

const HEAD_MOVEMENTS: ChallengeType[] = ["head-left", "head-right", "head-up", "head-down"];
const EXPRESSIONS: ChallengeType[] = ["smile", "mouth-open"];

interface ChallengeOrchestratorProps {
  sessionId: string;
  createdAt: string;
  challengeCount?: number;
  maxRetries?: number;
  onComplete: (passed: boolean, results: ChallengeResult[]) => void;
}

function selectChallenges(count: number): ChallengeType[] {
  const shuffled = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);
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
  onComplete,
}: ChallengeOrchestratorProps) {
  const [challenges] = useState<ChallengeType[]>(() =>
    selectChallenges(challengeCount)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ChallengeResult[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const totalChallenges = challenges.length;
  const currentChallenge = challenges[currentIndex];

  const handleChallengeComplete = useCallback(
    (passed: boolean, score: number, _hint: string | null) => {
      const result: ChallengeResult = { type: currentChallenge, passed, score };
      const newResults = [...results, result];
      setResults(newResults);

      if (currentIndex < totalChallenges - 1) {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
          setCurrentIndex((i) => i + 1);
        }, 1000);
      } else {
        const allPassed = newResults.every((r) => r.passed);
        onComplete(allPassed, newResults);
      }
    },
    [currentChallenge, currentIndex, totalChallenges, results, onComplete]
  );

  if (showSuccess) {
    return (
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-3 bg-green-500 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold text-white">Success!</p>
      </div>
    );
  }


  return (
    <div className="w-full">
      <ChallengeScreen
        sessionId={sessionId}
        createdAt={createdAt}
        challengeType={currentChallenge}
        currentIndex={currentIndex}
        totalChallenges={totalChallenges}
        onComplete={handleChallengeComplete}
      />
    </div>
  );
}
