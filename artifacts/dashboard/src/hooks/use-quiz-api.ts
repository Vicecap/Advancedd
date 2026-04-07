import { useQuery } from "@tanstack/react-query";

interface OTDBCategory {
  id: number;
  name: string;
}

export interface NormalisedQuestion {
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  category: string;
  difficulty: string;
  type: string;
  source: "opentdb" | "trivia-api";
}

export function useQuizCategories() {
  return useQuery({
    queryKey: ["https://opentdb.com/api_category.php"],
    queryFn: async () => {
      const res = await fetch("https://opentdb.com/api_category.php");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      return data.trivia_categories as OTDBCategory[];
    },
    staleTime: Infinity,
  });
}

async function _fetchOTDB(category: string, difficulty: string, type: string, amount: number): Promise<{ code: number; results: NormalisedQuestion[] }> {
  let url = `https://opentdb.com/api.php?amount=${amount}`;
  if (category) url += `&category=${category}`;
  if (difficulty) url += `&difficulty=${difficulty}`;
  if (type) url += `&type=${type}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to reach Open Trivia DB");
  const data = await res.json();

  const results = (data.results ?? []).map((q: {
    question: string; correct_answer: string; incorrect_answers: string[];
    category: string; difficulty: string; type: string;
  }) => ({ ...q, source: "opentdb" as const }));

  return { code: data.response_code as number, results };
}

export async function fetchOTDBQuestions(
  category: string,
  difficulty: string,
  type: string,
  neededAmount = 20,
): Promise<NormalisedQuestion[]> {
  const attempts = [neededAmount, Math.min(neededAmount, 15), 10];
  for (const amount of attempts) {
    const { code, results } = await _fetchOTDB(category, difficulty, type, amount);
    if (code === 0 && results.length > 0) return results;
    if (code !== 1) break;
  }
  if (difficulty && difficulty !== "") {
    const { code, results } = await _fetchOTDB(category, "", type, neededAmount);
    if (code === 0 && results.length > 0) return results;
  }
  throw new Error("Open Trivia DB: not enough questions for these filters. Try a different category or difficulty.");
}

export const TRIVIA_API_CATEGORIES = [
  { value: "general_knowledge",   label: "General Knowledge" },
  { value: "science",             label: "Science" },
  { value: "history",             label: "History" },
  { value: "geography",           label: "Geography" },
  { value: "arts_and_literature", label: "Arts & Literature" },
  { value: "music",               label: "Music" },
  { value: "film_and_tv",         label: "Film & TV" },
  { value: "sport_and_leisure",   label: "Sport & Leisure" },
  { value: "society_and_culture", label: "Society & Culture" },
  { value: "food_and_drink",      label: "Food & Drink" },
];

export async function fetchTriviaAPIQuestions(
  categories: string,
  difficulty: string,
  limit = 20,
): Promise<NormalisedQuestion[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (categories) params.set("categories", categories);
  if (difficulty && difficulty !== "any") params.set("difficulty", difficulty);

  const res = await fetch(`/api/trivia-external?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch questions" }));
    throw new Error(err.error ?? "Failed to fetch questions from The Trivia API");
  }

  const data = await res.json() as {
    question: { text: string };
    correctAnswer: string;
    incorrectAnswers: string[];
    category: string;
    difficulty: string;
    type?: string;
  }[];

  return data.map((q) => ({
    question: q.question.text,
    correct_answer: q.correctAnswer,
    incorrect_answers: q.incorrectAnswers,
    category: q.category,
    difficulty: q.difficulty,
    type: q.incorrectAnswers.length === 1 ? "boolean" : "multiple",
    source: "trivia-api" as const,
  }));
}
