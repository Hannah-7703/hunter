interface PlusButtonProps {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export default function PlusButton({ selected, onClick, disabled }: PlusButtonProps) {
  return (
    <button
      className={`plus-btn ${selected ? 'plus-btn-selected' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {selected ? '✓' : '+'}
    </button>
  );
}
