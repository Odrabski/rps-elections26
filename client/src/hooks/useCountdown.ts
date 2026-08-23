import { useEffect, useState } from 'react';

/** Seconds remaining until `deadline` (epoch ms), ticking once a second. Null while there's no deadline. */
export function useCountdown(deadline: number | null): number | null {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() =>
    deadline ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : null
  );

  useEffect(() => {
    if (!deadline) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  return secondsLeft;
}
