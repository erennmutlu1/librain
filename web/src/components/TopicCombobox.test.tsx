import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../i18n/lang';
import { RECORDED_TOPIC_PAIRS } from './TopicCombobox.data';
import { TopicCombobox } from './TopicCombobox';
import {
  buildTopicSuggestions,
  pickPatch,
  recentQuestions,
  recentTopics,
  rememberQuestion,
  rememberTopics,
  type RecordedPair,
  type TopicSuggestion,
} from './topicSuggestions';

const PAIRS: RecordedPair[] = [
  { topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5 },
  { topicA: 'graph attention networks', topicB: 'protein-ligand interaction prediction', topK: 5 },
  { topicA: 'valuing player actions in soccer', topicB: 'graph attention networks', topK: 3 },
];

const SUGGESTIONS: TopicSuggestion[] = [
  { value: 'weather foundation models', group: 'recent' },
  { value: 'drug discovery', group: 'recorded', hint: '× climate adaptation', pair: PAIRS[0]! },
  { value: 'graph attention networks', group: 'recorded', hint: '× protein-ligand interaction prediction', pair: PAIRS[1]! },
  { value: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks', group: 'paper' },
];

function Harness({ onPick, suggestions = SUGGESTIONS }: { onPick?: (s: TopicSuggestion) => void; suggestions?: TopicSuggestion[] }) {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <TopicCombobox label="Topic A" value={value} onChange={setValue} suggestions={suggestions} onPick={onPick} />
      <output data-testid="value">{value}</output>
    </form>
  );
}

function setup(props: Parameters<typeof Harness>[0] = {}) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const input = screen.getByRole('combobox', { name: 'Topic A' });
  return { user, input };
}

describe('TopicCombobox', () => {
  it('follows the ARIA 1.2 combobox pattern: closed until asked, then a labelled, grouped listbox', async () => {
    const { user, input } = setup();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    const listId = input.getAttribute('aria-controls')!;
    expect(document.getElementById(listId)).toHaveAttribute('role', 'listbox');

    // Tabbing in does not pop the list open.
    await user.tab();
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('listbox', { name: 'Suggestions for Topic A' });
    expect(within(list).getByRole('group', { name: 'Your recent topics' })).toBeInTheDocument();
    expect(within(list).getByRole('group', { name: 'Recorded topics' })).toBeInTheDocument();
    expect(within(list).getByRole('group', { name: 'Papers in the library' })).toBeInTheDocument();

    // ↓ highlights the first option; focus stays in the field.
    const options = within(list).getAllByRole('option');
    expect(options).toHaveLength(4);
    expect(input).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();
  });

  it('moves with the arrows (wrapping) and picks with Enter without submitting', async () => {
    const onPick = vi.fn();
    const { user, input } = setup({ onPick });
    await user.click(input);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    let options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    options = screen.getAllByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', options[3]!.id);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', options[1]!.id);

    await user.keyboard('{Enter}');
    expect(input).toHaveValue('drug discovery');
    expect(onPick).toHaveBeenCalledWith(SUGGESTIONS[1]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  it('filters as you type, ignoring case and accents, and highlights the match', async () => {
    const { user, input } = setup();
    await user.type(input, 'GRAPH');
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['graph attention networks× protein-ligand interaction prediction']);
    expect(within(options[0]!).getByText('graph', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByText('1 suggestion')).toBeInTheDocument();

    // A recorded topic is also found by its partner.
    await user.clear(input);
    await user.type(input, 'climate');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['drug discovery× climate adaptation']);
  });

  it('Escape closes the list, then clears the field; Enter with nothing highlighted submits', async () => {
    const onSubmit = vi.fn((e: Event) => e.preventDefault());
    const user = userEvent.setup();
    function Form() {
      const [value, setValue] = useState('');
      return (
        <form onSubmit={(e) => onSubmit(e.nativeEvent)}>
          <TopicCombobox label="Topic A" value={value} onChange={setValue} suggestions={SUGGESTIONS} />
          <button type="submit">Go</button>
        </form>
      );
    }
    render(<Form />);
    const input = screen.getByRole('combobox', { name: 'Topic A' });
    await user.type(input, 'drug');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue('drug');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('drug');
    await user.keyboard('{Escape}');
    expect(input).toHaveValue('');
  });

  it('Ctrl+Enter leaves a highlighted option alone so the form can submit', async () => {
    const onPick = vi.fn();
    const { user, input } = setup({ onPick });
    await user.type(input, 'drug');
    await user.keyboard('{ArrowDown}{Control>}{Enter}{/Control}');
    expect(onPick).not.toHaveBeenCalled();
    expect(input).toHaveValue('drug');
  });

  it('picks with the mouse and keeps focus in the field; the chevron shows everything', async () => {
    const onPick = vi.fn();
    const { user, input } = setup({ onPick });
    await user.click(screen.getByRole('button', { name: 'Show suggestions for Topic A' }));
    expect(input).toHaveFocus();
    await user.click(screen.getByRole('option', { name: /graph attention networks/ }));
    expect(input).toHaveValue('graph attention networks');
    expect(input).toHaveFocus();
    expect(onPick).toHaveBeenCalledWith(SUGGESTIONS[2]);

    // After a pick the list is not filtered by the picked value.
    await user.click(screen.getByRole('button', { name: 'Show suggestions for Topic A' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('stays open, with focus in the field, when a click lands on a group label or the list itself', async () => {
    const { user, input } = setup();
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox', { name: 'Suggestions for Topic A' });

    // A group's label (role="presentation", not an option).
    await user.click(screen.getByText('Recorded topics'));
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    // The list's own padding (or its scrollbar): the click target is the listbox.
    await user.click(listbox);
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    // Clicking away still closes it.
    await user.click(document.body);
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a hint and an error under the field, describes the field with both and marks it invalid', () => {
    render(
      <TopicCombobox
        label="Topic A"
        value=""
        onChange={() => {}}
        suggestions={[]}
        hint="For example: weather foundation models"
        error="Enter at least Topic A."
      />,
    );
    const input = screen.getByRole('combobox', { name: 'Topic A' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('For example: weather foundation models Enter at least Topic A.');
    expect(input).not.toHaveAttribute('placeholder');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least Topic A.');
  });

  it('speaks Turkish', async () => {
    const user = userEvent.setup();
    render(
      <LangProvider initial="tr">
        <TopicCombobox label="Konu B" optional value="" onChange={() => {}} suggestions={SUGGESTIONS} />
      </LangProvider>,
    );
    const input = screen.getByRole('combobox', { name: 'Konu B (isteğe bağlı)' });
    await user.click(input);
    expect(screen.getByRole('listbox', { name: 'Konu B için öneriler' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Son konularınız' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Kütüphanedeki makaleler' })).toBeInTheDocument();
  });
});

describe('topic suggestions', () => {
  const sources = { pairs: PAIRS, recent: ['my recent topic', 'drug discovery'], papers: ['A paper title'], recordedOnly: false };

  it('in Recorded mode offers exactly the recorded pairs, and only the partners once the other topic matches', () => {
    const recorded = { ...sources, recordedOnly: true };
    expect(buildTopicSuggestions('a', '', recorded).map((s) => [s.value, s.hint])).toEqual([
      ['drug discovery', '× climate adaptation'],
      ['graph attention networks', '× protein-ligand interaction prediction'],
      ['valuing player actions in soccer', '× graph attention networks'],
    ]);
    // Pairs match in either order, so both partners of "graph attention networks" are offered.
    expect(buildTopicSuggestions('b', 'Graph  Attention networks', recorded).map((s) => [s.value, s.group])).toEqual([
      ['protein-ligand interaction prediction', 'partner'],
      ['valuing player actions in soccer', 'partner'],
    ]);
  });

  it('in Live mode adds recent topics and paper titles, and never suggests the other field’s topic', () => {
    const list = buildTopicSuggestions('b', 'drug discovery', sources);
    expect(list.map((s) => `${s.group}:${s.value}`)).toEqual([
      'partner:climate adaptation',
      'recent:my recent topic',
      'recorded:protein-ligand interaction prediction',
      'recorded:graph attention networks',
      'paper:A paper title',
    ]);
  });

  it('picking a recorded topic fills its partner, and in Recorded mode its passage count', () => {
    const s: TopicSuggestion = { value: 'valuing player actions in soccer', group: 'recorded', pair: PAIRS[2]! };
    const empty = { topicA: 'valuing player actions in soccer', topicB: '', topK: '5' };
    expect(pickPatch('a', s, empty, false)).toEqual({ topicB: 'graph attention networks' });
    expect(pickPatch('a', s, { ...empty, topicB: 'my own topic' }, false)).toEqual({});
    expect(pickPatch('a', s, { ...empty, topicB: 'my own topic' }, true)).toEqual({ topicB: 'graph attention networks', topK: '3' });
    expect(pickPatch('a', { value: 'x', group: 'recent' }, empty, true)).toEqual({});
  });

  it('remembers ten recent topics and questions, newest first, without duplicates', () => {
    for (let i = 0; i < 12; i++) rememberTopics(`topic ${i}`);
    rememberTopics('Topic 11', '  ', undefined);
    expect(recentTopics()).toHaveLength(10);
    expect(recentTopics()[0]).toBe('Topic 11');
    expect(recentTopics()).not.toContain('topic 11');
    rememberQuestion('Why does GraphCast work?');
    expect(recentQuestions()).toEqual(['Why does GraphCast work?']);
  });

  it('survives storage that throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(recentTopics()).toEqual([]);
    expect(() => rememberTopics('x')).not.toThrow();
    spy.mockRestore();
    vi.restoreAllMocks();
  });

  it('keeps the tiny Live-mode list in step with the recorded run files', () => {
    const files = import.meta.glob<{ status: number; request: { topicA: string; topicB?: string; topK?: number } }>('../explore/data/*/runs/*.json', {
      eager: true,
      import: 'default',
    });
    const fromFiles = Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
      .filter(([, run]) => run.status === 200)
      .map(([, run]) => [run.request.topicA, run.request.topicB ?? null]);
    expect(RECORDED_TOPIC_PAIRS).toEqual(fromFiles);
    expect(Object.values(files).every((run) => (run.request.topK ?? 5) === 5)).toBe(true);
  });
});
