import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Apple keyboards show ⌘; everyone else presses Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform || navigator.userAgent);
}

/** The command palette's shortcut as the keyboard prints it. */
export function paletteShortcut(): string {
  return isApplePlatform() ? '⌘K' : 'Ctrl K';
}

/** ⌘K on Apple keyboards, Ctrl+K elsewhere (either is accepted everywhere). */
export function isPaletteShortcut(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

/** Typing targets, where single-key shortcuts such as "/" must never fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (target as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(type);
}
