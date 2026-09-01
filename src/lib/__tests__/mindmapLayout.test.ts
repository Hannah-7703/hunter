import { describe, it, expect } from 'vitest';
import { computeFocusLayout, fitLayoutToCanvas, nodesHash } from '@/lib/mindmapLayout';
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

describe('fitLayoutToCanvas', () => {
  it('keeps distant background nodes inside a positive, scrollable canvas', () => {
    const raw = new Map([
      ['root', { x: 360, y: 414 }],
      ['far-left', { x: -180, y: 120 }],
      ['far-bottom', { x: 900, y: 1280 }],
    ]);

    const fitted = fitLayoutToCanvas(raw, 880, 1060, 80);

    expect([...fitted.layout.values()].every(position => position.x >= 80 && position.y >= 80)).toBe(true);
    expect([...fitted.layout.values()].every(position => position.x <= fitted.width - 80 && position.y <= fitted.height - 80)).toBe(true);
    expect(fitted.width).toBeGreaterThanOrEqual(1060);
    expect(fitted.height).toBeGreaterThanOrEqual(1060);
  });
});

describe('computeFocusLayout', () => {
  it('在保留防碰撞间距的同时维持紧凑的主关联圈', () => {
    const nodes = ['root', 'a', 'b', 'c', 'd', 'e'].map(id => makeNode(id, id));
    const layout = computeFocusLayout(nodes, {
      rootNodeId: 'root',
      primaryRelated: ['a', 'b', 'c', 'd', 'e'],
      secondaryRelated: [],
      backgroundNodes: [],
    }, 720, 900);
    const root = layout.get('root')!;
    const primaryPositions = ['a', 'b', 'c', 'd', 'e'].map(id => layout.get(id)!);

    for (const position of primaryPositions) {
      expect(Math.hypot(position.x - root.x, position.y - root.y)).toBeLessThan(140);
    }

    for (let index = 0; index < primaryPositions.length; index++) {
      for (let other = index + 1; other < primaryPositions.length; other++) {
        expect(Math.hypot(
          primaryPositions[index].x - primaryPositions[other].x,
          primaryPositions[index].y - primaryPositions[other].y,
        )).toBeGreaterThanOrEqual(64);
      }
    }
  });
});
