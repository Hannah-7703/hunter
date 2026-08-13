import { describe, it, expect } from 'vitest';
import { nodesHash } from '@/lib/mindmapLayout';
import type { MindNode } from '@/shared/types';

function makeNode(id: string, label: string): MindNode {
  return {
    id,
    label,
    noteId: null,
    itemId: id,
    detail: '',
    date: '2026-08-01T00:00:00.000Z',
    user_id: 'test-user',
  };
}

describe('nodesHash', () => {
  it('相同输入 → 相同 hash', () => {
    const nodes1 = [makeNode('a', 'Alpha'), makeNode('b', 'Beta')];
    const nodes2 = [makeNode('a', 'Alpha'), makeNode('b', 'Beta')];

    expect(nodesHash(nodes1)).toBe(nodesHash(nodes2));
  });

  it('不同输入 → 不同 hash（label 不同）', () => {
    const nodes1 = [makeNode('a', 'Alpha')];
    const nodes2 = [makeNode('a', 'Different')];

    expect(nodesHash(nodes1)).not.toBe(nodesHash(nodes2));
  });

  it('不同输入 → 不同 hash（id 不同）', () => {
    const nodes1 = [makeNode('a', 'Alpha')];
    const nodes2 = [makeNode('b', 'Alpha')];

    expect(nodesHash(nodes1)).not.toBe(nodesHash(nodes2));
  });

  it('顺序变化不影响 hash', () => {
    const nodes1 = [makeNode('a', 'A'), makeNode('b', 'B')];
    const nodes2 = [makeNode('b', 'B'), makeNode('a', 'A')];

    expect(nodesHash(nodes1)).toBe(nodesHash(nodes2));
  });

  it('空数组 → 返回 hash', () => {
    expect(nodesHash([])).toBeTruthy();
    expect(typeof nodesHash([])).toBe('string');
  });
});
