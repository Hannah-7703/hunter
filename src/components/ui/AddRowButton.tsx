interface AddRowButtonProps {
  label: string;
  onClick: () => void;
}

export default function AddRowButton({ label, onClick }: AddRowButtonProps) {
  return (
    <button className="add-row-btn" onClick={onClick}>
      {label}
    </button>
  );
}
