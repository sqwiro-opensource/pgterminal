import { describe, expect, it } from 'vitest';
import { BINDINGS, matchesChord, type Binding, type Chord, type Scope } from '../../../src/renderer/src/lib/keybindings';

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>;

function ev(key: string, mods: Partial<Omit<KeyEventLike, 'key'>> = {}): KeyEventLike {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods };
}

/** Mirrors the dispatcher's lookup without touching the DOM or the store. */
function find(e: KeyEventLike, scope: Scope, mac: boolean): Binding | undefined {
  return BINDINGS.find((b) => {
    if (b.run === undefined || !b.scopes.includes(scope)) return false;
    const chords: Chord[] = mac ? b.chords.mac : b.chords.win;
    return chords.some((c) => matchesChord(e, c, mac));
  });
}

describe('matchesChord', () => {
  it('maps mod to ⌘ on mac and Ctrl elsewhere', () => {
    const chord: Chord = { key: 'k', mod: true };
    expect(matchesChord(ev('k', { metaKey: true }), chord, true)).toBe(true);
    expect(matchesChord(ev('k', { ctrlKey: true }), chord, true)).toBe(false);
    expect(matchesChord(ev('k', { ctrlKey: true }), chord, false)).toBe(true);
    expect(matchesChord(ev('k', { metaKey: true }), chord, false)).toBe(false);
  });

  it('compares every modifier exactly', () => {
    const chord: Chord = { key: 'k', mod: true };
    expect(matchesChord(ev('k', { metaKey: true, shiftKey: true }), chord, true)).toBe(false);
    expect(matchesChord(ev('k', { metaKey: true, altKey: true }), chord, true)).toBe(false);
  });

  it('honours literal Ctrl chords on both platforms', () => {
    const chord: Chord = { key: 'tab', ctrl: true };
    expect(matchesChord(ev('Tab', { ctrlKey: true }), chord, true)).toBe(true);
    expect(matchesChord(ev('Tab', { ctrlKey: true }), chord, false)).toBe(true);
    expect(matchesChord(ev('Tab', { metaKey: true }), chord, true)).toBe(false);
  });

  it('is case-insensitive on the key name', () => {
    expect(matchesChord(ev('K', { metaKey: true }), { key: 'k', mod: true }, true)).toBe(true);
  });
});

describe('BINDINGS', () => {
  it('gives every binding a label, group and platform glyphs', () => {
    for (const b of BINDINGS) {
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.keys.mac.length).toBeGreaterThan(0);
      expect(b.keys.win.length).toBeGreaterThan(0);
    }
  });

  it('documents an owner for every binding it does not run itself', () => {
    for (const b of BINDINGS) {
      if (!b.run) expect(b.ownedBy, `${b.id} needs ownedBy`).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = BINDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never fires two runnable bindings for the same chord in one scope', () => {
    for (const mac of [true, false]) {
      const seen = new Map<string, string>();
      for (const b of BINDINGS) {
        if (!b.run) continue;
        const chords = mac ? b.chords.mac : b.chords.win;
        for (const c of chords) {
          for (const scope of b.scopes) {
            const key = `${scope}/${c.key}/${c.mod ? 'm' : ''}${c.ctrl ? 'c' : ''}${c.shift ? 's' : ''}${c.alt ? 'a' : ''}`;
            const prev = seen.get(key);
            expect(prev, `${b.id} collides with ${prev} on ${key}`).toBeUndefined();
            seen.set(key, b.id);
          }
        }
      }
    }
  });
});

describe('dispatcher scoping', () => {
  it('leaves Monaco its own keys: ⌘/ does not open the shortcut sheet in the editor', () => {
    const e = ev('/', { metaKey: true });
    expect(find(e, 'global', true)?.id).toBe('shortcuts');
    expect(find(e, 'editor', true)).toBeUndefined();
  });

  it('does not run ⌘⇧F in the editor, where Monaco formats', () => {
    const e = ev('f', { metaKey: true, shiftKey: true });
    expect(find(e, 'global', true)?.id).toBe('focus.treeFilter');
    expect(find(e, 'editor', true)).toBeUndefined();
  });

  it('runs tab management everywhere, including text inputs', () => {
    expect(find(ev('w', { metaKey: true }), 'input', true)?.id).toBe('tab.close');
    expect(find(ev('n', { metaKey: true }), 'editor', true)?.id).toBe('tab.new');
    expect(find(ev('k', { metaKey: true }), 'input', true)?.id).toBe('palette');
  });

  it('keeps number and toggle chords out of text inputs', () => {
    expect(find(ev('1', { metaKey: true }), 'input', true)).toBeUndefined();
    expect(find(ev('1', { metaKey: true }), 'global', true)?.id).toBe('tab.index.1');
    expect(find(ev('b', { metaKey: true }), 'input', true)).toBeUndefined();
  });

  it('uses Alt+1–9 and F5 on Windows', () => {
    expect(find(ev('1', { altKey: true }), 'global', false)?.id).toBe('tab.index.1');
    expect(find(ev('1', { ctrlKey: true }), 'global', false)).toBeUndefined();
    expect(find(ev('F5'), 'global', false)?.id).toBe('tab.refresh');
    expect(find(ev('r', { metaKey: true }), 'global', true)?.id).toBe('tab.refresh');
  });

  it('cycles tabs with ⌃Tab on both platforms and ⌘⌥arrows on mac', () => {
    expect(find(ev('Tab', { ctrlKey: true }), 'global', true)?.id).toBe('tab.next');
    expect(find(ev('Tab', { ctrlKey: true, shiftKey: true }), 'global', false)?.id).toBe('tab.prev');
    expect(find(ev('ArrowRight', { metaKey: true, altKey: true }), 'global', true)?.id).toBe('tab.next');
  });

  it('maps the palette modes to distinct chords', () => {
    expect(find(ev('p', { metaKey: true }), 'global', true)?.id).toBe('palette.tables');
    expect(find(ev('d', { metaKey: true, shiftKey: true }), 'global', true)?.id).toBe('palette.document');
  });
});
