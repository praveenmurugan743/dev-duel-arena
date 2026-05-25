// Client-side question type WITHOUT correct_option.
// Correct answers live server-side only — see src/lib/game.server.ts
export type PublicQuestion = {
  id: number;
  question: string;
  options: string[];
  category: string;
  difficulty: string;
};
