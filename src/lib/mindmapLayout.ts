import type { MindNode } from '@/shared/types';

// ====== 共用类型 ======

export interface LayoutEdge {
  source: string;
  target: string;
  strength: 'strong' | 'weak';
}

export interface FocusResult {
  rootNodeId: string;
  primaryRelated: string[];
  secondaryRelated: string[];
  backgroundNodes: string[];
}

export interface FocusApiResponse {
  rootNode: { id: string; label: string };
  primaryRelated: string[];
  secondaryRelated: string[];
  backgroundNodes: string[];
}

// ====== 工具函数 ======

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function nodesHash(nodes: MindNode[]): string {
  const ids = nodes
    .map(n => `${n.id}:${n.label}`)
    .sort()
    .join(',');
  let hash = 0;
  for (let i = 0; i < ids.length; i++) {
    hash = ((hash << 5) - hash) + ids.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ====== Focus v2: 单主核心放射布局 ======

export function buildFocusResult(
  nodes: MindNode[],
  apiResponse: FocusApiResponse
): FocusResult {
  const nodeIds = new Set(nodes.map(n => n.id));

  const primaryRelated = (apiResponse.primaryRelated || []).filter(id => nodeIds.has(id));
  const secondaryRelated = (apiResponse.secondaryRelated || []).filter(id => nodeIds.has(id));
  const backgroundNodes = (apiResponse.backgroundNodes || []).filter(id => nodeIds.has(id));

  const inPrimary = new Set(primaryRelated);
  const filteredSecondary = secondaryRelated.filter(id => !inPrimary.has(id));
  const inHigh = new Set([...primaryRelated, ...filteredSecondary]);
  const filteredBg = backgroundNodes.filter(id => !inHigh.has(id) && id !== apiResponse.rootNode.id);

  const rootId = apiResponse.rootNode.id;
  const finalPrimary = primaryRelated.filter(id => id !== rootId);
  const finalSecondary = filteredSecondary.filter(id => id !== rootId);
  const finalBg = filteredBg.filter(id => id !== rootId);

  const classified = new Set([rootId, ...finalPrimary, ...finalSecondary, ...finalBg]);
  for (const n of nodes) {
    if (!classified.has(n.id)) {
      finalBg.push(n.id);
      classified.add(n.id);
    }
  }

  return {
    rootNodeId: rootId,
    primaryRelated: finalPrimary,
    secondaryRelated: finalSecondary,
    backgroundNodes: finalBg,
  };
}

export function buildVisibleEdges(focusResult: FocusResult): LayoutEdge[] {
  const edges: LayoutEdge[] = [];
  for (const id of focusResult.primaryRelated) {
    edges.push({ source: focusResult.rootNodeId, target: id, strength: 'strong' });
  }
  for (const id of focusResult.secondaryRelated) {
    edges.push({ source: focusResult.rootNodeId, target: id, strength: 'weak' });
  }
  return edges;
}

const FOCUS_NODE_SIZE = 60;
const FOCUS_MAX_ITER = 3;
const BACKGROUND_OUTER_RADIUS = 300;

export function computeFocusLayout(
  nodes: MindNode[],
  focusResult: FocusResult,
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const layout = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return layout;

  const { rootNodeId, primaryRelated, secondaryRelated, backgroundNodes } = focusResult;
  const rootX = width * 0.5;
  const rootY = height * 0.46;

  layout.set(rootNodeId, { x: rootX, y: rootY });

  const innerRadius = Math.min(130, 80 + primaryRelated.length * 2);
  for (let i = 0; i < primaryRelated.length; i++) {
    const baseAngle = (i / primaryRelated.length) * Math.PI * 2;
    const offset = ((hashCode(primaryRelated[i]) % 30) - 15) * (Math.PI / 180);
    const angle = baseAngle + offset;
    layout.set(primaryRelated[i], {
      x: rootX + Math.cos(angle) * innerRadius,
      y: rootY + Math.sin(angle) * innerRadius,
    });
  }

  const outerRadius = Math.min(220, Math.max(150, innerRadius + 60));
  for (let i = 0; i < secondaryRelated.length; i++) {
    const baseAngle = (i / Math.max(secondaryRelated.length, 1)) * Math.PI * 2;
    const offset = ((hashCode(secondaryRelated[i]) % 30) - 15) * (Math.PI / 180);
    const angle = baseAngle + offset;
    layout.set(secondaryRelated[i], {
      x: rootX + Math.cos(angle) * outerRadius,
      y: rootY + Math.sin(angle) * outerRadius,
    });
  }

  if (backgroundNodes.length > 0) {
    const bgNodes = nodes.filter(n => backgroundNodes.includes(n.id));
    const byNote = new Map<string | null, MindNode[]>();
    for (const node of bgNodes) {
      const key = node.noteId ?? '__deleted__';
      if (!byNote.has(key)) byNote.set(key, []);
      byNote.get(key)!.push(node);
    }
    const groups = [...byNote.entries()];

    const bgStartR = BACKGROUND_OUTER_RADIUS + 40;
    for (let gi = 0; gi < groups.length; gi++) {
      const [, groupNodes] = groups[gi];
      const groupR = bgStartR + gi * 80;
      const angleOffset = (gi * Math.PI) / 3;
      for (let ni = 0; ni < groupNodes.length; ni++) {
        const node = groupNodes[ni];
        const angle = angleOffset + (ni / groupNodes.length) * Math.PI * 2 + (hashCode(node.id) % 100) / 500;
        layout.set(node.id, {
          x: rootX + Math.cos(angle) * groupR,
          y: rootY + Math.sin(angle) * groupR,
        });
      }
    }
  }

  const allPositions = [...layout.entries()].map(([id, pos]) => ({ id, pos }));
  for (let iter = 0; iter < FOCUS_MAX_ITER; iter++) {
    let moved = false;
    for (let i = 0; i < allPositions.length; i++) {
      if (allPositions[i].id === rootNodeId) continue;
      for (let j = i + 1; j < allPositions.length; j++) {
        if (allPositions[j].id === rootNodeId) continue;
        const a = allPositions[i].pos;
        const b = allPositions[j].pos;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const overlap = FOCUS_NODE_SIZE - dist;

        if (overlap > 0) {
          const pushX = (dx / dist) * overlap * 0.55;
          const pushY = (dy / dist) * overlap * 0.55;
          a.x -= pushX;
          b.x += pushX;
          a.y -= pushY;
          b.y += pushY;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return layout;
}
