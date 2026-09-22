/**
 * Decides whether an editor should take an externally supplied value.
 *
 * Two rules pull against each other: never overwrite what someone is typing, and always show the
 * document that is actually open. Following a link leaves the editor focused while the tab moves
 * to another document, so the second rule has to win there.
 *
 * `valueKey` identifies what `value` represents. It changes a render before the new text arrives,
 * and in that gap the stale text still equals the model — which is why the key counts as applied
 * only when its own text has been written, never merely because the strings happen to match.
 */
export interface ValueSyncInput {
  modelValue: string;
  value: string;
  /** True while the editor still shows the previous `valueKey`'s content. */
  awaitingSwitch: boolean;
  hasFocus: boolean;
}

export type ValueSyncDecision = 'apply' | 'skip-in-sync' | 'skip-focused';

export function decideValueSync(i: ValueSyncInput): ValueSyncDecision {
  if (i.modelValue === i.value) return 'skip-in-sync';
  if (!i.awaitingSwitch && i.hasFocus) return 'skip-focused';
  return 'apply';
}

/** Whether the key may be recorded as applied after this decision. */
export function marksKeyApplied(decision: ValueSyncDecision, awaitingSwitch: boolean): boolean {
  if (decision === 'apply') return true;
  return decision === 'skip-in-sync' && !awaitingSwitch;
}
