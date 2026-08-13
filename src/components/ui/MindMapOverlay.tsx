'use client';

import type { MindNode } from '@/shared/types';

// ====== 变体 B：Background 节点居中卡片 ======

interface ScatterOverlayProps {
  node: MindNode;
  detail: string | null;
  onClose: () => void;
  onSetRoot?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;
}

function ScatterOverlay({ node, detail, onClose, onSetRoot, onDeleteNode }: ScatterOverlayProps) {
  return (
    <div className="scatter-overlay-mask" onClick={onClose}>
      <div className="scatter-overlay-card" onClick={e => e.stopPropagation()}>
        <div className="overlay-summary-row">
          <p
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 15,
              fontWeight: 500,
              color: 'var(--text-primary)',
              margin: 0,
              flex: 1,
            }}
          >
            {node.label}
          </p>
          {onSetRoot && (
            <button
              className="overlay-action-btn overlay-action-btn--promote"
              onClick={() => onSetRoot(node.id)}
              aria-label="设为 rootNode"
              title="设为 rootNode"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
        <p
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 14,
            color: detail ? 'var(--text-secondary)' : 'var(--text-hint)',
            margin: '8px 0 20px',
          }}
        >
          {detail || '原文已删除，详情不可用'}
        </p>
        {onDeleteNode && (
          <div className="dialog-actions" style={{ justifyContent: 'center' }}>
            <button
              className="dialog-btn-delete"
              onClick={() => onDeleteNode(node.id)}
            >
              删除
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ====== 变体 A：集群 Overlay（底部滑出） ======

interface RelatedNodeItem {
  node: MindNode;
  detail: string | null;
  type: 'primary' | 'secondary';
}

interface ClusterOverlayProps {
  rootNode: MindNode;
  rootDetail: string | null;
  relatedNodes: RelatedNodeItem[];
  highlightedNodeId: string | null;
  onClose: () => void;
  onSetRoot?: (nodeId: string) => void;
  onRemoveFromCluster?: (nodeId: string) => void;
  onDeleteRoot?: (nodeId: string) => void;
}

function ClusterOverlay({ rootNode, rootDetail, relatedNodes, highlightedNodeId, onClose, onSetRoot, onRemoveFromCluster, onDeleteRoot }: ClusterOverlayProps) {
  const primaryNodes = relatedNodes.filter(n => n.type === 'primary');
  const secondaryNodes = relatedNodes.filter(n => n.type === 'secondary');

  function renderNodeItem(item: RelatedNodeItem) {
    const isHighlighted = highlightedNodeId === item.node.id;
    return (
      <div
        key={item.node.id}
        className={`related-node-item ${isHighlighted ? 'highlighted' : ''}`}
      >
        <div className="overlay-summary-row">
          <p className="summary" style={{ flex: 1, margin: 0 }}>{item.node.label}</p>
          {onSetRoot && (
            <button
              className="overlay-action-btn overlay-action-btn--promote"
              onClick={() => onSetRoot(item.node.id)}
              aria-label="设为 rootNode"
              title="设为 rootNode"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="detail" style={{ color: item.detail ? undefined : 'var(--text-hint)' }}>{item.detail || '原文已删除，详情不可用'}</p>
        {onRemoveFromCluster && (
          <div className="overlay-remove-row">
            <button
              className="overlay-action-btn overlay-action-btn--remove"
              onClick={() => onRemoveFromCluster(item.node.id)}
              aria-label="移出聚合图"
              title="移出聚合图"
            >
              {'✕'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overlay-mask" onClick={onClose}>
      <div className="overlay-sheet" onClick={e => e.stopPropagation()}>
        <button className="overlay-close" onClick={onClose} aria-label="关闭">{'✕'}</button>

        {/* rootNode 头部卡片 */}
        <div className="root-node-header">
          <p className="summary">{rootNode.label}</p>
          <p className="detail" style={{ color: rootDetail ? undefined : 'var(--text-hint)' }}>
            {rootDetail || '原文已删除，详情不可用'}
          </p>
          {onDeleteRoot && (
            <div className="overlay-remove-row">
              <button
                className="overlay-action-btn overlay-action-btn--remove"
                onClick={() => onDeleteRoot(rootNode.id)}
                aria-label="删除根节点"
                title="删除根节点"
              >
                ×
              </button>
            </div>
          )}
        </div>

        {/* 直接相关 */}
        {primaryNodes.length > 0 && (
          <>
            <p className="related-section-title">直接相关 · {primaryNodes.length} 个观点</p>
            {primaryNodes.map(renderNodeItem)}
          </>
        )}

        {/* 间接相关 */}
        {secondaryNodes.length > 0 && (
          <>
            <p className="related-section-title">间接相关 · {secondaryNodes.length} 个观点</p>
            {secondaryNodes.map(renderNodeItem)}
          </>
        )}
      </div>
    </div>
  );
}

// ====== 统一导出 ======

export { ScatterOverlay, ClusterOverlay };
export type { ScatterOverlayProps, ClusterOverlayProps, RelatedNodeItem };
