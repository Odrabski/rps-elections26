/**
 * Copies text, falling back when the async Clipboard API isn't available.
 *
 * `navigator.clipboard` needs a secure context and a permissions check, and plenty of mobile
 * browsers refuse it — so relying on it alone means the copy silently does nothing on exactly the
 * devices where retyping a code by hand is most annoying. The old `execCommand` path still works
 * essentially everywhere, so it's kept as the fallback.
 *
 * Returns whether the text actually made it, so the caller can avoid claiming success it didn't get.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused — fall through and try the old way.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    // Off-screen but still focusable: `display: none` or `hidden` would make the selection fail.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length); // iOS ignores select() on its own
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
