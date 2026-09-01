'use client';

interface NodeActionDialogProps {
  mode: 'cluster' | 'scatter' | 'root' | 'retry-read' | 'retry-analysis';
  onRemoveFromCluster?: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function NodeActionDialog({ mode, onRemoveFromCluster, onDelete, onCancel }: NodeActionDialogProps) {
  if (mode === 'retry-read' || mode === 'retry-analysis') {
    const isReadFailure = mode === 'retry-read';
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog-card" style={{ background: 'rgba(255, 250, 243, 0.92)' }} onClick={e => e.stopPropagation()}>
          <h3 className="dialog-title">{isReadFailure ? '脑图保存结果读取失败' : '自动关联分析请求失败'}</h3>
          <p className="dialog-desc">
            {isReadFailure ? '当前先为你展示基础散点图，是否重新读取？' : '当前图已保留，是否重新分析关联？'}
          </p>
          <div className="dialog-actions">
            <button className="dialog-btn-cancel" onClick={onCancel}>取消</button>
            <button className="dialog-btn-delete" onClick={onDelete}>重试</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'cluster') {
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog-card" onClick={e => e.stopPropagation()}>
          <h3 className="dialog-title">若原笔记已删除，选择移出脑图则无法找回该节点内容</h3>
          <div className="dialog-actions">
            <button className="dialog-btn-cancel" onClick={onRemoveFromCluster}>移出聚合图</button>
            <button className="dialog-btn-delete" style={{ flex: 1.2 }} onClick={onDelete}>移出脑图</button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'root') {
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog-card root-delete-dialog" onClick={e => e.stopPropagation()}>
          <h3 className="dialog-title root-delete-dialog-title">是否移出脑图？</h3>
          <p className="dialog-desc root-delete-dialog-desc">若移除该节点则脑图将重新聚类；若原笔记删除，则该节点内容无法找回</p>
          <div className="dialog-actions root-delete-dialog-actions">
            <button className="dialog-btn-cancel root-delete-dialog-cancel" onClick={onCancel}>取消</button>
            <button className="dialog-btn-delete root-delete-dialog-confirm" onClick={onDelete}>删除</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" style={{ background: 'rgba(255, 250, 243, 0.92)' }} onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">是否移出脑图？</h3>
        <p className="dialog-desc">若原笔记已删除，则无法找回该节点内容</p>
        <div className="dialog-actions">
          <button className="dialog-btn-cancel" onClick={onCancel}>取消</button>
          <button className="dialog-btn-delete" onClick={onDelete}>删除</button>
        </div>
      </div>
    </div>
  );
}
