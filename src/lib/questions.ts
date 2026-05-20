export type Question = {
  id: number;
  question: string;
  options: string[];
  correct_option: string;
  category: string;
  difficulty: string;
};

let cache: Question[] | null = null;

export async function loadQuestions(): Promise<Question[]> {
  if (cache) return cache;
  const res = await fetch("/questions.json");
  if (!res.ok) throw new Error("Failed to load questions");
  cache = (await res.json()) as Question[];
  return cache;
}

export async function pickRandomQuestionIds(count: number): Promise<number[]> {
  const all = await loadQuestions();
  const ids = all.map((q) => q.id);
  // Shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, ids.length));
}

export async function getQuestionsByIds(ids: number[]): Promise<Question[]> {
  const all = await loadQuestions();
  const map = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => map.get(id)).filter((q): q is Question => !!q);
}
