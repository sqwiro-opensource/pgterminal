import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  DEFAULT_SENTINEL,
  INVOKE_CHANNELS,
  PUSH_CHANNELS,
  isDefaultSentinel,
  type InvokeChannel,
  type PushChannel
} from '../../src/shared/ipc';

const CHANNEL_RE = /^[a-z]+:[a-zA-Z]+$/;

describe('IPC contract', () => {
  it('invoke channels are unique and well-formed', () => {
    expect(new Set(INVOKE_CHANNELS).size).toBe(INVOKE_CHANNELS.length);
    for (const c of INVOKE_CHANNELS) expect(c).toMatch(CHANNEL_RE);
  });

  it('push channels are unique and well-formed', () => {
    expect(new Set(PUSH_CHANNELS).size).toBe(PUSH_CHANNELS.length);
    for (const c of PUSH_CHANNELS) expect(c).toMatch(CHANNEL_RE);
  });

  it('push and invoke channels do not overlap', () => {
    const invoke = new Set<string>(INVOKE_CHANNELS);
    for (const c of PUSH_CHANNELS) expect(invoke.has(c)).toBe(false);
  });

  it('channel tuples match the map keys at the type level', () => {
    expectTypeOf<(typeof INVOKE_CHANNELS)[number]>().toEqualTypeOf<InvokeChannel>();
    expectTypeOf<(typeof PUSH_CHANNELS)[number]>().toEqualTypeOf<PushChannel>();
  });

  it('isDefaultSentinel recognises only the sentinel', () => {
    expect(isDefaultSentinel(DEFAULT_SENTINEL)).toBe(true);
    expect(isDefaultSentinel({ __pguiDefault: true })).toBe(true);
    expect(isDefaultSentinel({ __pguiDefault: false })).toBe(false);
    expect(isDefaultSentinel(null)).toBe(false);
    expect(isDefaultSentinel('DEFAULT')).toBe(false);
    expect(isDefaultSentinel(1)).toBe(false);
    expect(isDefaultSentinel([])).toBe(false);
  });
});
