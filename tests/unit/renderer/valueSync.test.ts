import { describe, expect, it } from 'vitest';
import { decideValueSync, marksKeyApplied } from '../../../src/renderer/src/features/editor/valueSync';

describe('decideValueSync', () => {
  it('leaves typing alone when the value changes underneath', () => {
    expect(decideValueSync({ modelValue: 'typed', value: 'external', awaitingSwitch: false, hasFocus: true })).toBe('skip-focused');
  });

  it('applies an external change when the editor is not focused', () => {
    expect(decideValueSync({ modelValue: 'old', value: 'new', awaitingSwitch: false, hasFocus: false })).toBe('apply');
  });

  it('applies a different document even while focused', () => {
    // Following a link leaves the editor focused; the new document must still be shown.
    expect(decideValueSync({ modelValue: 'doc a', value: 'doc b', awaitingSwitch: true, hasFocus: true })).toBe('apply');
  });

  it('does nothing when the model already holds the value', () => {
    expect(decideValueSync({ modelValue: 'same', value: 'same', awaitingSwitch: false, hasFocus: true })).toBe('skip-in-sync');
  });
});

describe('marksKeyApplied', () => {
  it('does not consider the switch done while the stale text still matches', () => {
    // The key changes a render before its text arrives: the old text still equals the model.
    expect(marksKeyApplied('skip-in-sync', true)).toBe(false);
  });

  it('records the key once its own text is written', () => {
    expect(marksKeyApplied('apply', true)).toBe(true);
  });

  it('records the key when already in sync for it', () => {
    expect(marksKeyApplied('skip-in-sync', false)).toBe(true);
  });

  it('does not record while refusing to clobber typing', () => {
    expect(marksKeyApplied('skip-focused', false)).toBe(false);
  });
});
