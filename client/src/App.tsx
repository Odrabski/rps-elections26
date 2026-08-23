import { useState } from 'react';
import { useGameSocket } from './hooks/useGameSocket';
import { HomeScreen } from './components/HomeScreen';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { GameOverScreen } from './components/GameOverScreen';
import { TEAM_THEME } from './data/theme';
import './App.css';

export default function App() {
  const [codeCopied, setCodeCopied] = useState(false);
  const {
    roomCode,
    team,
    view,
    opponentConnected,
    errorMessage,
    createRoom,
    joinRoom,
    placeSpecial,
    shuffleHands,
    ready,
    move,
    tiePick,
    rematch,
    leave,
  } = useGameSocket();

  if (!roomCode || !team) {
    return <HomeScreen onCreate={createRoom} onJoin={joinRoom} errorMessage={errorMessage} />;
  }

  if (!view || view.phase === 'lobby') {
    return (
      <div className="lobby-screen">
        <button type="button" className="exit-btn" onClick={leave} aria-label="עזוב">
          🚪
        </button>
        <div className="lobby-panel panel">
          <h1 className="gradient-heading">ממתין ליריב...</h1>
          <p className="lobby-hint">שלחו את הקוד הזה ליריב שלכם:</p>
          <div className="lobby-code-row">
            <div className="lobby-code">{roomCode}</div>
            <button
              type="button"
              className="lobby-copy-btn"
              aria-label="העתק קוד"
              title={codeCopied ? 'הועתק!' : 'העתק קוד'}
              onClick={async () => {
                await navigator.clipboard.writeText(roomCode);
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 1500);
              }}
            >
              {codeCopied ? '✅' : '📋'}
            </button>
          </div>
          <p className="lobby-team" style={{ color: TEAM_THEME[team].text }}>
            אתם משחקים בתור {TEAM_THEME[team].label}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {!opponentConnected && view.phase !== 'gameover' && (
        <div className="disconnect-banner">היריב התנתק — ממתין לחיבור מחדש...</div>
      )}

      {view.phase === 'setup' && (
        <SetupScreen
          view={view}
          team={team}
          onPlaceSpecial={placeSpecial}
          onShuffle={shuffleHands}
          onReady={ready}
          onExit={leave}
        />
      )}

      {view.phase === 'playing' && (
        <GameBoard view={view} team={team} onMove={move} onTiePick={tiePick} onExit={leave} />
      )}

      {view.phase === 'gameover' && view.winner && (
        <GameOverScreen winner={view.winner} you={team} onRematch={rematch} onBackToLobby={leave} />
      )}
    </>
  );
}
