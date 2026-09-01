import { createMindNode, listMindNodes } from './api';
import {
  addCachedMindNode,
  appendMindmapNode,
  deleteNodeFromCache,
  markMindmapNodeEverAdded,
} from './clientDataCache';
import { showToast } from '@/components/ui/Toast';

export async function toggleMindNode(
  noteId: string,
  itemId: string,
  summary: string,
  detail: string,
  currentIds: Set<string>,
  onPending?: (pending: boolean) => void,
  onSuccess?: () => void,
): Promise<Set<string>> {
  if (!summary.trim()) {
    showToast('请先填写观点内容', 'error');
    return currentIds;
  }

  if (currentIds.has(itemId)) {
    // 移除 — 同步等待 API
    onPending?.(true);

    try {
      const nodes = await listMindNodes();
      const target = nodes.find(n => n.itemId === itemId && n.noteId === noteId);
      if (target) {
        await deleteNodeFromCache(target.id);
      }

      const next = new Set(currentIds);
      next.delete(itemId);
      showToast('已从脑图移除', 'success');
      onSuccess?.();
      return next;
    } catch {
      showToast('移除失败，请稍后重试', 'error');
      return currentIds;
    } finally {
      onPending?.(false);
    }
  }

  // 添加 — 同步等待 API
  onPending?.(true);

  try {
    const createdNode = await createMindNode({
      label: summary,
      noteId,
      itemId,
      detail,
      date: new Date().toISOString(),
    });

    addCachedMindNode(createdNode);
    void markMindmapNodeEverAdded();
    // 新观点只和当前根节点做增量关联判断；不重算旧聚合图。
    void appendMindmapNode(createdNode.id);

    const next = new Set(currentIds);
    next.add(itemId);
    // 成功提示由 AI Notes 页根据「总沉淀数」决定：
    // 未达到可聚合数量时展示进度引导，达到后才展示“已加入脑图”。
    onSuccess?.();
    return next;
  } catch {
    showToast('添加失败，请稍后重试', 'error');
    return currentIds;
  } finally {
    onPending?.(false);
  }
}
