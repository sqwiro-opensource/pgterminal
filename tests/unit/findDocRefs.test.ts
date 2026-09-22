import { describe, expect, it } from 'vitest';
import { findDocRefs } from '../../src/shared/doclink/findDocRefs';

describe('findDocRefs (PROP-04)', () => {
  it('finds refs at any depth with pointer paths, never in keys', () => {
    const doc = {
      'sales_customer/1': 'not a ref key',
      owner: 'auth_user/3',
      meta: { owner: 'auth_user/4', nested: { deep: 'crm_tag/9' } },
      tags: ['crm_tag/4', 'plain', 'crm_tag/12'],
      n: 5,
      b: true,
      z: null
    };
    const found = findDocRefs(doc);
    expect(found.map((f) => [f.path, f.ref.raw])).toEqual([
      ['/owner', 'auth_user/3'],
      ['/meta/owner', 'auth_user/4'],
      ['/meta/nested/deep', 'crm_tag/9'],
      ['/tags/0', 'crm_tag/4'],
      ['/tags/2', 'crm_tag/12']
    ]);
  });

  it('handles a root string, escapes pointer segments, and respects limits', () => {
    expect(findDocRefs('users/1')).toEqual([{ path: '', ref: expect.objectContaining({ raw: 'users/1' }) }]);
    expect(findDocRefs({ 'a/b': 'users/2', 'c~d': 'users/3' }).map((f) => f.path)).toEqual(['/a~1b', '/c~0d']);
    const many = { list: Array.from({ length: 20 }, (_, i) => `users/${i}`) };
    expect(findDocRefs(many, { maxRefs: 5 })).toHaveLength(5);
    let deep: unknown = 'users/9';
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(findDocRefs(deep as never, { maxDepth: 32 })).toHaveLength(0);
    expect(findDocRefs(deep as never, { maxDepth: 64 })).toHaveLength(1);
    expect(findDocRefs(undefined)).toEqual([]);
    expect(findDocRefs(null)).toEqual([]);
  });
});
