export type ChallengeType =
  | "head-left"
  | "head-right"
  | "head-up"
  | "head-down"
  | "smile"
  | "mouth-open";

export interface ChallengeResult {
  type: ChallengeType;
  passed: boolean;
  score: number;
}
