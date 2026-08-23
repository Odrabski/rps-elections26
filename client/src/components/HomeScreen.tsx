import { useState } from 'react';
import './HomeScreen.css';

interface HomeScreenProps {
  onCreate: () => void;
  onJoin: (code: string) => void;
  errorMessage: string | null;
}

export function HomeScreen({ onCreate, onJoin, errorMessage }: HomeScreenProps) {
  const [code, setCode] = useState('');

  return (
    <div className="home-screen">
      <div className="home-panel panel">
        <h1 className="gradient-heading home-title">פוליטיקה: אבן, נייר ומספריים</h1>
        <p className="home-subtitle">קואליציה נגד אופוזיציה — משחק אסטרטגיה לשני שחקנים</p>

        <button type="button" className="btn-primary home-create-btn" onClick={onCreate}>
          צור משחק חדש
        </button>

        <div className="home-divider">
          <span>או</span>
        </div>

        <form
          className="home-join-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onJoin(code.trim());
          }}
        >
          <input
            className="home-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="קוד משחק"
            maxLength={4}
            autoCapitalize="characters"
          />
          <button type="submit" className="btn-secondary" disabled={!code.trim()}>
            הצטרף
          </button>
        </form>

        {errorMessage && <p className="home-error">{errorMessage}</p>}
      </div>
    </div>
  );
}
