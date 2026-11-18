import type { KeyboardEvent } from 'react';

/**
 * Ctrl+Enter (⌘+Enter on a Mac) submits the form from any of its fields,
 * including a textarea, where a plain Enter is a new line. Put it on the
 * <form>'s onKeyDown. The form's own onSubmit still validates, so nothing
 * runs that a click on the submit button would not run.
 */
export function submitOnModEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
  event.preventDefault();
  const form = event.currentTarget;
  const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submitter?.disabled) return;
  form.requestSubmit(submitter ?? undefined);
}
