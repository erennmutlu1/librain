/*
 * "Spot the risk" score, kept in localStorage when it can be. Reads and writes
 * are guarded, so the quiz works with storage blocked; the score then lasts
 * for the visit only.
 */

export const QUIZ_KEY = 'librain.explore.quiz';

export interface QuizScore {
  answered: number;
  correct: number;
  streak: number;
  best: number;
}

export const EMPTY_SCORE: QuizScore = { answered: 0, correct: 0, streak: 0, best: 0 };

const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

export function loadScore(): { score: QuizScore; persistent: boolean } {
  try {
    const raw = window.localStorage.getItem(QUIZ_KEY);
    if (!raw) return { score: EMPTY_SCORE, persistent: true };
    const r = JSON.parse(raw) as Record<string, unknown>;
    const score = { answered: count(r.answered), correct: count(r.correct), streak: count(r.streak), best: count(r.best) };
    return { score: { ...score, correct: Math.min(score.correct, score.answered), best: Math.max(score.best, score.streak) }, persistent: true };
  } catch {
    return { score: EMPTY_SCORE, persistent: false };
  }
}

/** Returns whether the score was stored. */
export function saveScore(score: QuizScore): boolean {
  try {
    window.localStorage.setItem(QUIZ_KEY, JSON.stringify(score));
    return true;
  } catch {
    return false;
  }
}

export function recordAnswer(score: QuizScore, correct: boolean): QuizScore {
  const streak = correct ? score.streak + 1 : 0;
  return {
    answered: score.answered + 1,
    correct: score.correct + (correct ? 1 : 0),
    streak,
    best: Math.max(score.best, streak),
  };
}
