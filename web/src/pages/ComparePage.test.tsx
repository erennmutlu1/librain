import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App';
import { createMockApi } from '../api/mockClient';
import { createLocalRunStore } from '../history/localRunStore';
import { defaultRecordings } from '../mocks/scenarios';

/*
 * Compare's form: with no recording for the topics (as in the public
 * Recorded mode, which substitutes nothing), the notice appears right under
 * the Compare button and takes focus, instead of far below the recorded list.
 */
function setup() {
  const api = createMockApi({ latency: 0, recordings: { ...defaultRecordings, fallback: null, strict: true } });
  const runStore = createLocalRunStore({ getStorage: () => window.localStorage });
  render(<App api={api} runStore={runStore} initialPath="/compare" />);
  return { user: userEvent.setup() };
}

describe('Compare: no recording for the topics', () => {
  it('says so under the Compare button, moves focus there, and says what to do', async () => {
    const { user } = setup();
    await user.type(await screen.findByRole('combobox', { name: 'Topic A' }), 'tidal energy');
    await user.type(screen.getByRole('combobox', { name: /Topic B/ }), 'bird migration');
    const submit = screen.getByRole('button', { name: 'Compare' });
    await user.click(submit);

    const title = await screen.findByText('This is the recorded demo, and no recorded run matches these inputs.');
    const wrapper = title.closest('[tabindex="-1"]') as HTMLElement;
    expect(wrapper).toHaveFocus();
    // Inside the form, straight after the button: not in the result area below.
    const form = submit.closest('form')!;
    expect(form).toContainElement(wrapper);
    expect(submit.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText('This is the recorded demo, and no recorded run matches these inputs.')).toHaveLength(1);
    expect(within(wrapper).getByText(/pick a suggested topic or question, open Ideas/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});
