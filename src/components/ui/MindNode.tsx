interface MindNodeProps {
  type: 'root' | 'primary' | 'secondary' | 'background';
  label: string;
  x: number;
  y: number;
  onClick: () => void;
  highlighted?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  root: '#3A3836',
  primary: '#8A857C',
  secondary: '#BFB8AD',
  background: '#E0D9D0',
};

const SIZE_MAP: Record<string, number> = {
  root: 18,
  primary: 12,
  secondary: 8,
  background: 8,
};

export default function MindNode({ type, label, x, y, onClick, highlighted }: MindNodeProps) {
  const size = SIZE_MAP[type];

  return (
    <div
      className="mind-dot-wrapper"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 44,
        height: 44,
        overflow: 'visible',
        transform: 'translate(-50%, -50%)',
        opacity: highlighted === false ? 0.4 : 1,
        transition: 'left 500ms ease, top 500ms ease',
      }}
    >
      <button
        onClick={onClick}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <div style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: COLOR_MAP[type],
          pointerEvents: 'none',
        }} />
      </button>
      {type === 'root' && (
        <div className="root-label">{label}</div>
      )}
    </div>
  );
}
