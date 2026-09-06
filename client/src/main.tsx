import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// The other half of keeping the art out of a save menu (see the `img` rule in index.css): the
// right-click / long-press menu itself. Scoped to images rather than the whole document, so the
// context menu still works everywhere it is genuinely useful — pasting a room code, most of all.
document.addEventListener('contextmenu', (e) => {
  if (e.target instanceof HTMLImageElement) e.preventDefault();
});

// On a cold load, iOS Safari/Chrome (both WebKit) can report a viewport size to `position:fixed`
// elements that doesn't match the *actual* visible area for a moment while the dynamic address
// bar/toolbar is still settling — leaving a gap below full-screen overlays (SplashScreen,
// HomeScreen) until something forces a reflow, e.g. a manual refresh. Measuring the real height
// ourselves and exposing it as a CSS variable sidesteps that, since --app-vh is driven by an
// actual measurement instead of the browser's own (occasionally stale) viewport-unit computation.
function setAppHeightVar() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', `${height * 0.01}px`);
}
setAppHeightVar();
window.addEventListener('resize', setAppHeightVar);
window.addEventListener('orientationchange', setAppHeightVar);
window.visualViewport?.addEventListener('resize', setAppHeightVar);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
