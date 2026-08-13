import { dbListMindNodes } from '@/lib/db';
import { enrichNodeContexts, type EnrichedNodeContext } from '@/lib/nodeContext';
import { deepseekChat } from '@/lib/deepseekClient';
import { validateSession } from '@/lib/auth';
import { logError, logInfo } from '@/lib/logger';

interface FocusRequestNode {
  id: string;
}

interface FocusNodeResolved {
  id: string;
  label: string;
  noteId: string | null;
  itemId: string;
  detail: string;
}

interface FocusApiResponse {
  rootNode: { id: string; label: string; reason: string };
  primaryRelated: string[];
  secondaryRelated: string[];
  backgroundNodes: string[];
}

interface PreviousFocusInput {
  rootNodeId: string;
  primaryRelated: string[];
  secondaryRelated: string[];
  backgroundNodes: string[];
}

// ====== 格式化上下文 ======

function formatContext(ctx: EnrichedNodeContext): string {
  const noteLine = ctx.noteTitle ? `笔记：${ctx.noteTitle}` : '笔记：(孤立观点，原笔记已删除)';
  const detailLine = ctx.detail ? `解释：${ctx.detail}` : '解释：(无详细解释)';
  return `"${ctx.id}":\n  ${noteLine}\n  短标题：${ctx.summary}\n  ${detailLine}`;
}

// ====== Prompt 构建 ======

function buildFullPrompt(contexts: EnrichedNodeContext[]): string {
  const nodeBlocks = contexts.map(formatContext).join('\n\n');

  return `你是一个帮助用户整理知识结构的 AI 思考助手。

以下是一个用户沉淀的所有观点，每个观点包含所属笔记标题、短标题和解释：

${nodeBlocks}

请完成以下任务：

1. 从所有观点中找出语义上最核心、最具概括性的 1 个观点作为 rootNode。
   优先看"能概括其他观点的目标/问题/方案"，而不是词更抽象的标题。
   如果两个观点表达同一主题的不同侧面，选择更抽象/更根本的那个。

2. 对每个剩余节点，判断它与 rootNode 的语义关联强度：
   - primaryRelated：只有"对象、问题、场景、因果链或目标"有明确关系，才可判为直接相关
   - secondaryRelated：间接相关、同一大类但不同分支、松散的启发关系
   - backgroundNodes：与 rootNode 无实质语义关联
   禁止通过第三个节点推导二跳关联。

仅输出 JSON，不要其他内容：
{
  "rootNode": { "id": "...", "reason": "一句话解释为什么这是最核心的观点" },
  "primaryRelated": ["id1", "id2"],
  "secondaryRelated": ["id3", "id4"],
  "backgroundNodes": ["id5", "id6"]
}`;
}

function buildIncrementalPrompt(
  rootContext: EnrichedNodeContext,
  newContexts: EnrichedNodeContext[]
): string {
  const newBlocks = newContexts.map(formatContext).join('\n\n');

  return `你是一个帮助用户整理知识结构的 AI 思考助手。

已知脑图核心观点 rootNode：
${formatContext(rootContext)}

以下是一个或多个新加入的观点，判断它们与 rootNode 的语义关联：

${newBlocks}

对每个新节点，判断它与 rootNode 的语义关联强度：
- primaryRelated：只有"对象、问题、场景、因果链或目标"有明确关系，才可判为直接相关
- secondaryRelated：间接相关、同一大类但不同分支、松散的启发关系
- backgroundNodes：与 rootNode 无实质语义关联
禁止通过第三个节点推导二跳关联。

仅输出 JSON，不要其他内容：
{
  "primaryRelated": ["id1"],
  "secondaryRelated": ["id2"],
  "backgroundNodes": ["id3"]
}`;
}

function buildForcedRootPrompt(
  rootContext: EnrichedNodeContext,
  otherContexts: EnrichedNodeContext[]
): string {
  const otherBlocks = otherContexts.map(formatContext).join('\n\n');

  return `你是一个帮助用户整理知识结构的 AI 思考助手。

已知脑图核心观点 rootNode（用户手动指定）：
${formatContext(rootContext)}

以下是所有其他观点，判断它们与 rootNode 的语义关联：

${otherBlocks}

对每个节点，判断它与 rootNode 的语义关联强度：
- primaryRelated：只有"对象、问题、场景、因果链或目标"有明确关系，才可判为直接相关
- secondaryRelated：间接相关、同一大类但不同分支、松散的启发关系
- backgroundNodes：与 rootNode 无实质语义关联
禁止通过第三个节点推导二跳关联。

仅输出 JSON，不要其他内容：
{
  "primaryRelated": ["id1"],
  "secondaryRelated": ["id2"],
  "backgroundNodes": ["id3"]
}`;
}

// ====== 稳定锚点逻辑 ======

function normalizePreviousFocus(
  nodeIds: Set<string>,
  previousFocus: PreviousFocusInput | undefined,
): PreviousFocusInput | null {
  if (!previousFocus?.rootNodeId) return null;
  if (!nodeIds.has(previousFocus.rootNodeId)) return null;

  const primaryRelated = (previousFocus.primaryRelated ?? []).filter(
    id => nodeIds.has(id) && id !== previousFocus.rootNodeId
  );
  const inPrimary = new Set(primaryRelated);
  const secondaryRelated = (previousFocus.secondaryRelated ?? []).filter(
    id => nodeIds.has(id) && id !== previousFocus.rootNodeId && !inPrimary.has(id),
  );
  const inRelated = new Set([...inPrimary, ...secondaryRelated]);
  const backgroundNodes = (previousFocus.backgroundNodes ?? []).filter(
    id => nodeIds.has(id) && id !== previousFocus.rootNodeId && !inRelated.has(id),
  );

  return { rootNodeId: previousFocus.rootNodeId, primaryRelated, secondaryRelated, backgroundNodes };
}

function applyStabilityAnchor(
  nodes: FocusNodeResolved[],
  newClassification: { primaryRelated: string[]; secondaryRelated: string[]; backgroundNodes: string[] },
  previousFocus: PreviousFocusInput,
): FocusApiResponse {
  const primaryRelated = [...previousFocus.primaryRelated];
  const secondaryRelated = [...previousFocus.secondaryRelated];
  const backgroundNodes = [...previousFocus.backgroundNodes];

  for (const node of nodes) {
    if (node.id === previousFocus.rootNodeId) continue;
    const isOld =
      previousFocus.primaryRelated.includes(node.id) ||
      previousFocus.secondaryRelated.includes(node.id) ||
      previousFocus.backgroundNodes.includes(node.id);
    if (isOld) continue;

    if (newClassification.primaryRelated.includes(node.id)) {
      primaryRelated.push(node.id);
    } else if (newClassification.secondaryRelated.includes(node.id)) {
      secondaryRelated.push(node.id);
    } else {
      backgroundNodes.push(node.id);
    }
  }

  const classified = new Set([
    previousFocus.rootNodeId,
    ...primaryRelated,
    ...secondaryRelated,
    ...backgroundNodes,
  ]);
  for (const node of nodes) {
    if (!classified.has(node.id)) {
      backgroundNodes.push(node.id);
      classified.add(node.id);
    }
  }

  return {
    rootNode: {
      id: previousFocus.rootNodeId,
      label: nodes.find(n => n.id === previousFocus.rootNodeId)?.label ?? '',
      reason: '新增节点时保持上一版核心观点',
    },
    primaryRelated,
    secondaryRelated,
    backgroundNodes,
  };
}

// ====== 校验 ======

function validateAndSanitize(
  nodeIds: Set<string>,
  raw: FocusApiResponse
): FocusApiResponse {
  if (!raw.rootNode?.id) {
    throw new Error('rootNode 校验失败：rootNode 为空或无效');
  }

  const primaryRelated = (raw.primaryRelated || []).filter(id => nodeIds.has(id));
  const secondaryRelated = (raw.secondaryRelated || []).filter(id => nodeIds.has(id));
  const backgroundNodes = (raw.backgroundNodes || []).filter(id => nodeIds.has(id));

  const inPrimary = new Set(primaryRelated);
  const filteredSecondary = secondaryRelated.filter(id => !inPrimary.has(id));
  const inHighPriority = new Set([...primaryRelated, ...filteredSecondary, raw.rootNode.id]);
  const filteredBg = backgroundNodes.filter(id => !inHighPriority.has(id));

  const finalPrimary = primaryRelated.filter(id => id !== raw.rootNode.id);
  const finalSecondary = filteredSecondary.filter(id => id !== raw.rootNode.id);
  const finalBg = filteredBg.filter(id => id !== raw.rootNode.id);

  const classified = new Set([raw.rootNode.id, ...finalPrimary, ...finalSecondary, ...finalBg]);
  for (const id of nodeIds) {
    if (!classified.has(id)) {
      finalBg.push(id);
      classified.add(id);
    }
  }

  const total = 1 + finalPrimary.length + finalSecondary.length + finalBg.length;
  if (total !== nodeIds.size) {
    for (const id of nodeIds) {
      if (!classified.has(id)) {
        finalBg.push(id);
        classified.add(id);
      }
    }
  }

  return {
    rootNode: { id: raw.rootNode.id, label: raw.rootNode.label || '', reason: raw.rootNode.reason || '' },
    primaryRelated: finalPrimary,
    secondaryRelated: finalSecondary,
    backgroundNodes: finalBg,
  };
}

function validateIncrementalResponse(
  nodeIds: Set<string>,
  raw: { primaryRelated: string[]; secondaryRelated: string[]; backgroundNodes: string[] }
): { primaryRelated: string[]; secondaryRelated: string[]; backgroundNodes: string[] } {
  const primaryRelated = (raw.primaryRelated || []).filter(id => nodeIds.has(id));
  const inPrimary = new Set(primaryRelated);
  const secondaryRelated = (raw.secondaryRelated || []).filter(id => nodeIds.has(id) && !inPrimary.has(id));
  const inHigh = new Set([...primaryRelated, ...secondaryRelated]);
  const backgroundNodes = (raw.backgroundNodes || []).filter(id => nodeIds.has(id) && !inHigh.has(id));

  return { primaryRelated, secondaryRelated, backgroundNodes };
}

// ====== POST Handler ======

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await validateSession(request);
    if (!ctx) {
      return Response.json({ error: '未认证', code: 401 }, { status: 401 });
    }

    const body = (await request.json()) as {
      nodes?: FocusRequestNode[];
      previousFocus?: PreviousFocusInput;
      forcedRootNodeId?: string;
      forcedBackgroundNodes?: string[];
    };
    const requestNodes = body.nodes;

    if (!requestNodes || !Array.isArray(requestNodes) || requestNodes.length === 0) {
      return Response.json({ error: 'nodes 不能为空', code: 400 }, { status: 400 });
    }

    if (requestNodes.length > 200) {
      return Response.json({ error: '节点数量超过上限', code: 400 }, { status: 400 });
    }

    // 服务端解析节点数据
    const allMindNodes = await dbListMindNodes(ctx);
    const requestNodeIds = new Set(requestNodes.map(n => n.id));
    const resolvedNodes: FocusNodeResolved[] = [];
    for (const mn of allMindNodes) {
      if (requestNodeIds.has(mn.id)) {
        resolvedNodes.push({
          id: mn.id,
          label: mn.label,
          noteId: mn.noteId,
          itemId: mn.itemId,
          detail: mn.detail ?? '',
        });
      }
    }

    const foundIds = new Set(resolvedNodes.map(n => n.id));
    for (const n of requestNodes) {
      if (!foundIds.has(n.id)) {
        // 节点在 DB 中不存在，跳过
      }
    }

    if (resolvedNodes.length === 0) {
      return Response.json({ error: '所有请求节点在数据库中不存在', code: 400 }, { status: 400 });
    }

    // 构建上下文包
    const contextMap = await enrichNodeContexts(resolvedNodes, ctx);
    const allContexts = resolvedNodes.map(n => contextMap.get(n.id)!).filter(Boolean);

    const forcedBgSet = new Set(body.forcedBackgroundNodes ?? []);

    // 用户手动置顶 rootNode
    if (body.forcedRootNodeId) {
      const forcedRoot = resolvedNodes.find(n => n.id === body.forcedRootNodeId);
      if (forcedRoot) {
        const rootContext = contextMap.get(forcedRoot.id)!;
        const otherContexts = allContexts.filter(c => c.id !== forcedRoot.id);

        if (otherContexts.length === 0) {
          return Response.json({
            rootNode: { id: forcedRoot.id, label: forcedRoot.label },
            primaryRelated: [],
            secondaryRelated: [],
            backgroundNodes: [],
          });
        }

        const prompt = buildForcedRootPrompt(rootContext, otherContexts);
        const result = await deepseekChat(
          [{ role: 'user', content: prompt }],
          { temperature: 0.3, max_tokens: 2048, timeout: 25000, response_format: { type: 'json_object' } }
        );

        if ('error' in result) {
          return Response.json({ error: '脑图结构分析失败', code: 500 }, { status: 500 });
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(result.content.trim());
        } catch {
          return Response.json({ error: '脑图结构分析失败', code: 500 }, { status: 500 });
        }

        const nodeIdSet = new Set(resolvedNodes.map(n => n.id));
        const classification = validateIncrementalResponse(nodeIdSet, {
          primaryRelated: (parsed.primaryRelated as string[]) ?? [],
          secondaryRelated: (parsed.secondaryRelated as string[]) ?? [],
          backgroundNodes: (parsed.backgroundNodes as string[]) ?? [],
        });
        const aiResult = validateAndSanitize(nodeIdSet, {
          rootNode: { id: forcedRoot.id, label: forcedRoot.label, reason: '用户手动置顶' },
          primaryRelated: classification.primaryRelated.filter(id => !forcedBgSet.has(id)),
          secondaryRelated: classification.secondaryRelated.filter(id => !forcedBgSet.has(id)),
          backgroundNodes: classification.backgroundNodes,
        });

        logInfo('MIND_NODE_FOCUS_COMPLETED', {
          route: '/api/mind-nodes/focus',
          primaryCount: aiResult.primaryRelated.length,
          secondaryCount: aiResult.secondaryRelated.length,
          backgroundCount: aiResult.backgroundNodes.length,
          incremental: false,
        });

        return Response.json({
          rootNode: { id: aiResult.rootNode.id, label: aiResult.rootNode.label },
          primaryRelated: aiResult.primaryRelated,
          secondaryRelated: aiResult.secondaryRelated,
          backgroundNodes: aiResult.backgroundNodes,
        });
      }
    }

    // 增量模式判定（forcedRootNodeId 为空时走原有逻辑）
    const previousFocus = normalizePreviousFocus(
      new Set(resolvedNodes.map(n => n.id)),
      body.previousFocus,
    );
    const isIncremental = previousFocus !== null;

    let prompt: string;

    if (isIncremental) {
      const rootContext = contextMap.get(previousFocus.rootNodeId);
      if (!rootContext) {
        prompt = buildFullPrompt(allContexts);
      } else {
        const previousNodeIds = new Set([
          previousFocus.rootNodeId,
          ...previousFocus.primaryRelated,
          ...previousFocus.secondaryRelated,
          ...previousFocus.backgroundNodes,
        ]);
        const newContexts = allContexts.filter(c => !previousNodeIds.has(c.id));
        if (newContexts.length === 0) {
          const rootNode = resolvedNodes.find(n => n.id === previousFocus.rootNodeId);
          const forcedBgArr = [...forcedBgSet].filter(id => id !== previousFocus.rootNodeId);
          const existingBg = new Set(previousFocus.backgroundNodes);
          for (const id of forcedBgArr) {
            if (!existingBg.has(id)) existingBg.add(id);
          }
          return Response.json({
            rootNode: { id: previousFocus.rootNodeId, label: rootNode?.label ?? '' },
            primaryRelated: previousFocus.primaryRelated.filter(id => !forcedBgSet.has(id)),
            secondaryRelated: previousFocus.secondaryRelated.filter(id => !forcedBgSet.has(id)),
            backgroundNodes: [...existingBg],
          });
        }
        prompt = buildIncrementalPrompt(rootContext, newContexts);
      }
    } else {
      prompt = buildFullPrompt(allContexts);
    }

    const result = await deepseekChat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, max_tokens: 2048, timeout: 25000, response_format: { type: 'json_object' } }
    );

    if ('error' in result) {
      return Response.json({ error: '脑图结构分析失败', code: 500 }, { status: 500 });
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(result.content.trim());
    } catch {
      return Response.json({ error: '脑图结构分析失败', code: 500 }, { status: 500 });
    }

    const nodeIdSet = new Set(resolvedNodes.map(n => n.id));
    let aiResult: FocusApiResponse;

    if (isIncremental) {
      const newClassification = validateIncrementalResponse(nodeIdSet, {
        primaryRelated: (parsed.primaryRelated as string[]) ?? [],
        secondaryRelated: (parsed.secondaryRelated as string[]) ?? [],
        backgroundNodes: (parsed.backgroundNodes as string[]) ?? [],
      });
      aiResult = applyStabilityAnchor(resolvedNodes, newClassification, previousFocus);
      // 强制将用户移除的节点归入 backgroundNodes
      if (forcedBgSet.size > 0) {
        aiResult.primaryRelated = aiResult.primaryRelated.filter(id => !forcedBgSet.has(id));
        aiResult.secondaryRelated = aiResult.secondaryRelated.filter(id => !forcedBgSet.has(id));
        for (const id of forcedBgSet) {
          if (id !== aiResult.rootNode.id && !aiResult.backgroundNodes.includes(id)) {
            aiResult.backgroundNodes.push(id);
          }
        }
      }
      const finalCheck = validateAndSanitize(nodeIdSet, aiResult);
      aiResult = finalCheck;
    } else {
      const candidate = parsed as unknown as FocusApiResponse;
      aiResult = validateAndSanitize(nodeIdSet, candidate);
      if (forcedBgSet.size > 0) {
        aiResult.primaryRelated = aiResult.primaryRelated.filter(id => !forcedBgSet.has(id));
        aiResult.secondaryRelated = aiResult.secondaryRelated.filter(id => !forcedBgSet.has(id));
        for (const id of forcedBgSet) {
          if (id !== aiResult.rootNode.id && !aiResult.backgroundNodes.includes(id)) {
            aiResult.backgroundNodes.push(id);
          }
        }
      }
    }

    logInfo('MIND_NODE_FOCUS_COMPLETED', {
      route: '/api/mind-nodes/focus',
      primaryCount: aiResult.primaryRelated.length,
      secondaryCount: aiResult.secondaryRelated.length,
      backgroundCount: aiResult.backgroundNodes.length,
      incremental: isIncremental,
    });

    return Response.json({
      rootNode: { id: aiResult.rootNode.id, label: aiResult.rootNode.label },
      primaryRelated: aiResult.primaryRelated,
      secondaryRelated: aiResult.secondaryRelated,
      backgroundNodes: aiResult.backgroundNodes,
    });
  } catch {
    logError('MIND_NODE_FOCUS_FAILED', {
      route: '/api/mind-nodes/focus',
      errorType: 'UNEXPECTED',
    });
    return Response.json({ error: '服务暂时不可用', code: 500 }, { status: 500 });
  }
}
