import './AudioToggle.css';

interface AudioToggleProps {
  label: string;
  on: boolean;
  onToggle: () => void;
}

/**
 * One labelled audio switch, shared by the splash and the speaker menu so the two places that offer
 * the same choice can't drift apart.
 *
 * `role="switch"` rather than a styled checkbox: the knob's position is the only visual cue, so the
 * on/off state has to be announced rather than inferred.
 */
export function AudioToggle({ label, on, onToggle }: AudioToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`audio-toggle${on ? ' audio-toggle-on' : ''}`}
      onClick={onToggle}
    >
      <span className="audio-toggle-track">
        <span className="audio-toggle-knob" />
      </span>
      <span className="audio-toggle-label">{label}</span>
    </button>
  );
}
