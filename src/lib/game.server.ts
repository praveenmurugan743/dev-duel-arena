// Server-only access to the full question bank (including correct answers).
// Never import this from client code.
import questionsData from "@/data/questions.json";

export type ServerQuestion = {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  category: string;
  difficulty: string;
};

const ALL: ServerQuestion[] = questionsData as ServerQuestion[];

export function getAllQuestionIds(): number[] {
  return ALL.map((q) => q.id);
}

export function pickRandomIds(count: number): number[] {
  const ids = getAllQuestionIds();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, ids.length));
}

export function getQuestionById(id: number): ServerQuestion | undefined {
  return ALL.find((q) => q.id === id);
}

export function sanitizeQuestions(ids: number[]) {
  return ids
    .map((id) => getQuestionById(id))
    .filter((q): q is ServerQuestion => !!q)
    .map(({ correct_option: _omit, ...rest }) => rest);
}

export type PublicQuestion = ReturnType<typeof sanitizeQuestions>[number];
