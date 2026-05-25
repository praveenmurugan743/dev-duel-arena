// Pure scoring helper — mirrors the server-side scoring logic in
// src/lib/game.functions.ts so it can be unit tested in isolation.
export const QUESTION_SECONDS = 15;
export const BASE_POINTS = 100;
export const TIME_MULTIPLIER = 10;

export function calculateScore(isCorrect: boolean, timeLeftSeconds: number): number {
  if (!isCorrect) return 0;
  const clamped = Math.max(0, Math.min(QUESTION_SECONDS, timeLeftSeconds));
  return BASE_POINTS + Math.round(clamped * TIME_MULTIPLIER);
}
