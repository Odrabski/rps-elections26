interface ExitButtonProps {
  onClick: () => void;
  label?: string;
}

/** The bottom-right way out, shared by the lobby, setup and game screens.
 *
 * The ✕ carries it alone; `label` survives as the accessible name, which a screen reader still
 * needs since a bare glyph says nothing. */
export function ExitButton({ onClick, label = 'פרישה' }: ExitButtonProps) {
  return (
    <button type="button" className="exit-btn" onClick={onClick} aria-label={label}>
      <span className="exit-btn-x" aria-hidden="true">
        ✕
      </span>
    </button>
  );
}
