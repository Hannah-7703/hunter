import { createMindNode, deleteMindNode, listMindNodes } from './api';
import {
  addCachedMindNode,
  removeCachedMindNode,
  syncMindNodesAndPrepareFocus,
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
        await deleteMindNode(target.id);
        removeCachedMindNode(target.id);
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
    void syncMindNodesAndPrepareFocus();

    const next = new Set(currentIds);
    next.add(itemId);
    showToast('已加入脑图', 'success');
    onSuccess?.();
    return next;
  } catch {
    showToast('添加失败，请稍后重试', 'error');
    return currentIds;
  } finally {
    onPending?.(false);
  }
}
