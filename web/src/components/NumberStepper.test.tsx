import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../i18n/lang';
import { NumberStepper } from './NumberStepper';

function Harness({ initial = '5' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberStepper label="Passages per topic" value={value} onChange={setValue} min={1} max={20} />
      <button type="button">elsewhere</button>
    </>
  );
}

function setup(initial?: string) {
  const user = userEvent.setup();
  render(<Harness initial={initial} />);
  return { user, field: screen.getByRole('spinbutton', { name: 'Passages per topic' }) };
}

describe('NumberStepper', () => {
  it('is a labelled spinbutton with its range and a hint', () => {
    const { field } = setup();
    expect(field).toHaveValue('5');
    expect(field).toHaveAttribute('aria-valuemin', '1');
    expect(field).toHaveAttribute('aria-valuemax', '20');
    expect(field).toHaveAttribute('aria-valuenow', '5');
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAccessibleDescription('1 to 20');
  });

  it('steps with − and +, which stop at the limits and stay out of the Tab order', async () => {
    const { user, field } = setup('19');
    const plus = screen.getByRole('button', { name: 'Increase Passages per topic' });
    const minus = screen.getByRole('button', { name: 'Decrease Passages per topic' });
    expect(plus).toHaveAttribute('tabindex', '-1');
    await user.click(plus);
    expect(field).toHaveValue('20');
    expect(plus).toBeDisabled();
    await user.click(minus);
    expect(field).toHaveValue('19');
  });

  it('answers the arrow keys, Page Up/Down, Home and End, clamped to the range', async () => {
    const { user, field } = setup();
    await user.click(field);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(field).toHaveValue('7');
    await user.keyboard('{ArrowDown}');
    expect(field).toHaveValue('6');
    await user.keyboard('{PageUp}');
    expect(field).toHaveValue('11');
    await user.keyboard('{PageUp}{PageUp}');
    expect(field).toHaveValue('20');
    await user.keyboard('{Home}');
    expect(field).toHaveValue('1');
    await user.keyboard('{ArrowDown}');
    expect(field).toHaveValue('1');
    await user.keyboard('{End}');
    expect(field).toHaveValue('20');
    expect(field).toHaveAttribute('aria-valuenow', '20');
  });

  it('takes typed digits only and clamps (or restores) on leaving the field', async () => {
    const { user, field } = setup('8');
    await user.clear(field);
    await user.type(field, '4a2');
    expect(field).toHaveValue('42');
    await user.tab();
    expect(field).toHaveValue('20');

    await user.clear(field);
    await user.tab();
    // Empty goes back to the last valid value.
    expect(field).toHaveValue('20');

    await user.clear(field);
    await user.type(field, '0');
    await user.tab();
    expect(field).toHaveValue('1');
  });

  it('keeps focus in the field when − and + are pressed, even as one disables at a limit', async () => {
    const { user, field } = setup('19');
    await user.click(field);
    expect(field).toHaveFocus();
    const plus = screen.getByRole('button', { name: 'Increase Passages per topic' });
    await user.click(plus);
    expect(field).toHaveValue('20');
    expect(plus).toBeDisabled();
    // Without preventDefault on mousedown the button took focus, then dropped it to <body> as it disabled.
    expect(field).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Decrease Passages per topic' }));
    expect(field).toHaveValue('19');
    expect(field).toHaveFocus();
  });

  it('is aria-invalid with no aria-valuenow while a typed value is out of range', async () => {
    const { user, field } = setup('8');
    expect(field).not.toHaveAttribute('aria-invalid');
    await user.clear(field);
    await user.type(field, '42');
    expect(field).toHaveValue('42');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).not.toHaveAttribute('aria-valuenow');
    await user.tab();
    expect(field).toHaveValue('20');
    expect(field).toHaveAttribute('aria-valuenow', '20');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('shows a form error under its hint, marks the field invalid and is described by both', () => {
    render(
      <>
        <NumberStepper label="Passages per topic" value="5" onChange={() => {}} min={1} max={20} error="Pick a number from 1 to 20." describedBy="extra" />
        <p id="extra">Extra note</p>
      </>,
    );
    const field = screen.getByRole('spinbutton', { name: 'Passages per topic' });
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription('1 to 20 Pick a number from 1 to 20. Extra note');
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a number from 1 to 20.');
  });

  it('takes `invalid` alone for an error shown elsewhere', () => {
    render(<NumberStepper label="Passages per topic" value="5" onChange={() => {}} min={1} max={20} invalid />);
    expect(screen.getByRole('spinbutton', { name: 'Passages per topic' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('speaks Turkish', () => {
    render(
      <LangProvider initial="tr">
        <NumberStepper label="Konu başına parça" value="5" onChange={() => {}} min={1} max={20} />
      </LangProvider>,
    );
    expect(screen.getByRole('button', { name: 'Konu başına parça: artır' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Konu başına parça' })).toHaveAccessibleDescription('1 ile 20 arası');
  });
});
