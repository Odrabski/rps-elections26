interface ExitButtonProps {
  onClick: () => void;
  label?: string;
}

/** The bottom-right way out, shared by the lobby, setup and game screens. */
export function ExitButton({ onClick, label = 'יציאה' }: ExitButtonProps) {
  return (
    <button type="button" className="exit-btn" onClick={onClick} aria-label={label}>
      <span className="exit-btn-x" aria-hidden="true">
        ✕
      </span>
      <span className="exit-btn-label">{label}</span>
    </button>
  );
}
