import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { StatusBadge } from '../components/AnnotatedClaim';
import { CategoryTag, ExploreLoadError, ExploreLoading, ExploreTabs } from '../components/explore/ExploreParts';
import { Icon, StatusIcon } from '../components/Icon';
import type { ClaimStatus } from '../api/types';
import { explorePath } from '../explore/manifests';
import { buildRound, quizQuestions, ROUND_EXTRAPOLATED, type ExploreData, type QuizQuestion } from '../explore/model';
import { EMPTY_SCORE, loadScore, recordAnswer, saveScore, type QuizScore } from '../explore/quizScore';
import { useExploreData } from '../explore/useDiscoveries';
import { formatPercent, topicLabel } from '../lib/format';
import { STATUS_META, STATUS_ORDER } from '../lib/vocabulary';
import styles from './ExploreQuizPage.module.css';

/*
 * /explore/quiz: "Spot the risk". A real novel-claim sentence; guess the
 * validator's verdict; see its rationale. ?q=D1.2 starts on that sentence, so
 * a question can be shared. The score is kept in localStorage when allowed.
 */

function Scoreboard({ score, persistent, onReset }: { score: QuizScore; persistent: boolean; onReset: () => void }) {
  return (
    <div className={styles.scoreboard}>
      <dl className={styles.scores}>
        <div>
          <dt>Score</dt>
          <dd className="num">
            {score.correct}
            <span className={styles.of}>/{score.answered}</span>
          </dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd className="num">{score.streak}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd className="num">{score.best}</dd>
        </div>
      </dl>
      <div className={styles.scoreActions}>
        {score.answered > 0 ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={onReset}>
            Reset score
          </button>
        ) : null}
        {!persistent ? <p className={styles.memoryNote}>This browser is not allowing storage, so the score lasts for this visit.</p> : null}
      </div>
    </div>
  );
}

function Question({
  question,
  number,
  total,
  onAnswer,
  answer,
  onNext,
  last,
}: {
  question: QuizQuestion;
  number: number;
  total: number;
  onAnswer: (status: ClaimStatus) => void;
  answer: ClaimStatus | null;
  onNext: () => void;
  last: boolean;
}) {
  const resultRef = useRef<HTMLHeadingElement>(null);
  const correct = answer === question.status;
  const d = question.discovery;

  useEffect(() => {
    if (answer) resultRef.current?.focus();
  }, [answer]);

  return (
    <section className={styles.card} aria-labelledby="quiz-q">
      <div className={styles.cardHead}>
        <h2 id="quiz-q" className={styles.qNumber}>
          Sentence {number} of {total}
        </h2>
        <CategoryTag category={d.category} short />
      </div>
      <p className={styles.from}>From the novel claim of “{topicLabel(d.request.topicA, d.request.topicB)}”</p>
      <blockquote className={styles.sentence}>{question.sentence}</blockquote>

      <fieldset className={styles.choices} disabled={answer !== null}>
        <legend className={styles.legend}>What did the validator say?</legend>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.choice}
            data-status={s}
            aria-pressed={answer === s}
            data-correct={answer !== null && s === question.status ? true : undefined}
            onClick={() => onAnswer(s)}
          >
            <StatusIcon status={s} size={16} />
            <span className={styles.choiceLabel}>{STATUS_META[s].label}</span>
          </button>
        ))}
      </fieldset>

      {answer ? (
        <div className={styles.result} data-correct={correct || undefined}>
          <h3 ref={resultRef} tabIndex={-1} className={styles.resultTitle}>
            <Icon name={correct ? 'check' : 'close'} size={16} />
            {correct ? 'Right.' : 'Not quite.'} The validator said <StatusBadge status={question.status} />
          </h3>
          <p className={styles.prob}>
            {formatPercent(question.probability)} chance this sentence states something the evidence does not support.
          </p>
          <p className={styles.rationale}>
            <span className={styles.rationaleLabel}>Validator’s rationale:</span> {question.rationale || 'No rationale given.'}
          </p>
          <div className={styles.resultActions}>
            <button type="button" className="btn btn-primary" onClick={onNext}>
              {last ? 'See the round' : 'Next sentence'} <Icon name="arrow" size={14} />
            </button>
            <Link to={explorePath(d.id)} className="btn">
              Open {d.id}: the whole idea
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QuizBody({ data }: { data: ExploreData }) {
  const [params, setParams] = useSearchParams();
  const questions = useMemo(() => quizQuestions(data.discoveries), [data]);
  const [initialQ] = useState(() => params.get('q') ?? undefined);
  const [round, setRound] = useState(() => buildRound(questions, Math.random, initialQ));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<(ClaimStatus | null)[]>(() => round.map(() => null));
  const [{ score, persistent }, setScore] = useState(() => {
    const loaded = loadScore();
    return { score: loaded.score, persistent: loaded.persistent };
  });
  const doneRef = useRef<HTMLHeadingElement>(null);

  const done = index >= round.length;
  const current = round[index];

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  // Keep the address shareable: ?q= names the sentence on screen.
  useEffect(() => {
    if (!current) return;
    setParams((prev) => {
      if (prev.get('q') === current.qid) return prev;
      const next = new URLSearchParams(prev);
      next.set('q', current.qid);
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [current, setParams]);

  const answer = (status: ClaimStatus) => {
    if (!current || answers[index]) return;
    setAnswers((a) => a.map((x, i) => (i === index ? status : x)));
    setScore((s) => {
      const next = recordAnswer(s.score, status === current.status);
      return { score: next, persistent: saveScore(next) };
    });
  };

  const newRound = () => {
    const next = buildRound(questions);
    setRound(next);
    setAnswers(next.map(() => null));
    setIndex(0);
  };

  const counts = { grounded: 0, extrapolated: 0, risky: 0 };
  for (const q of questions) counts[q.status]++;
  const roundCorrect = round.filter((q, i) => answers[i] === q.status).length;
  const risky = round.filter((q) => q.status === 'risky');

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <Scoreboard
          score={score}
          persistent={persistent}
          onReset={() =>
            setScore(() => ({ score: EMPTY_SCORE, persistent: saveScore(EMPTY_SCORE) }))
          }
        />
        {current && !done ? (
          <Question
            key={current.qid + index}
            question={current}
            number={index + 1}
            total={round.length}
            answer={answers[index] ?? null}
            onAnswer={answer}
            onNext={() => setIndex((i) => i + 1)}
            last={index === round.length - 1}
          />
        ) : (
          <section className={styles.card} aria-labelledby="quiz-done">
            <h2 id="quiz-done" ref={doneRef} tabIndex={-1} className={styles.doneTitle}>
              Round complete: {roundCorrect} of {round.length} right
            </h2>
            <p>
              The risky sentences in this round came from{' '}
              {risky.map((q, i) => (
                <span key={q.qid}>
                  <Link to={explorePath(q.discovery.id)}>{q.discovery.id}</Link>
                  {i < risky.length - 2 ? ', ' : i === risky.length - 2 ? ' and ' : ''}
                </span>
              ))}
              . Open one to see the sentence in context.
            </p>
            <div className="cluster">
              <button type="button" className="btn btn-primary" onClick={newRound}>
                Play another round
              </button>
              <Link to={explorePath()} className="btn">
                Explore the ideas
              </Link>
            </div>
          </section>
        )}
      </div>

      <aside className={styles.aside} aria-labelledby="quiz-how">
        <h2 id="quiz-how" className={styles.asideTitle}>
          The three verdicts
        </h2>
        <ul role="list" className={styles.verdicts}>
          {STATUS_ORDER.map((s) => (
            <li key={s}>
              <StatusIcon status={s} size={14} /> {STATUS_META[s].label}
              <span className={styles.verdictDesc}>{STATUS_META[s].description}</span>
            </li>
          ))}
        </ul>
        <p className={styles.asideNote}>
          Across all {questions.length} checked sentences, {counts.extrapolated} are extrapolated, {counts.risky} risky and{' '}
          {counts.grounded} grounded. Each round shows every risky and grounded sentence and {ROUND_EXTRAPOLATED} extrapolated
          ones, so “extrapolated” is not a safe guess.
        </p>
      </aside>
    </div>
  );
}

export default function ExploreQuizPage() {
  const { state, retry } = useExploreData();
  if (state.status === 'error') {
    return (
      <div className="page">
        <ExploreLoadError title="Spot the risk" onRetry={retry} />
      </div>
    );
  }
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Spot the risk</h1>
        <p className="page-lede">
          Each sentence comes from a real novel claim. Guess how the validator judged it: grounded in the evidence,
          extrapolated beyond it, or risky.
        </p>
      </header>
      <ExploreTabs data={state.status === 'ready' ? state.data : undefined} />
      {state.status === 'ready' ? <QuizBody data={state.data} /> : <ExploreLoading label="Loading the quiz" />}
    </div>
  );
}
