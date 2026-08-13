'use client';

interface DeleteDialogProps {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteDialog({ title, description, onConfirm, onCancel }: DeleteDialogProps) {
  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-card" onClick={e => e.stopPropagation()}>
        <h3 className="dialog-title">{title}</h3>
        <p className="dialog-desc">{description}</p>
        <div className="dialog-actions">
          <button className="dialog-btn-cancel" onClick={onCancel}>取消</button>
          <button className="dialog-btn-delete" onClick={onConfirm}>删除</button>
        </div>
      </div>
    </div>
  );
}
