import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginScreen        from './screens/LoginScreen';
import PickScreen         from './screens/PickScreen';
import LeaderboardScreen  from './screens/LeaderboardScreen';
import PlayerHistoryScreen from './screens/PlayerHistoryScreen';
import TeamSquadScreen    from './screens/TeamSquadScreen';
import AdminScreen        from './screens/AdminScreen';
import Navbar             from './components/Navbar';

/* ── Global Toast ─────────────────────────────────────────────────────────── */
function GlobalToast() {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let timer;
    const handler = (e) => {
      const { msg, type = 'info' } = e.detail;
      setToast({ msg, type });
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('captain-toast', handler);
    return () => { window.removeEventListener('captain-toast', handler); clearTimeout(timer); };
  }, []);

  if (!toast) return null;

  const colors = {
    success: { bg: '#10b981', text: '#fff' },
    error:   { bg: 'var(--red)',   text: '#fff' },
    warning: { bg: 'var(--gold)',  text: '#000' },
    info:    { bg: 'var(--card)',  text: 'var(--text-primary)', border: '1px solid var(--gold)' },
  };
  const c = colors[toast.type] || colors.info;

  return (
    <div
      onClick={() => setToast(null)}
      style={{
        position: 'fixed', top: 90, left: '50%',
        transform: 'translateX(-50%)',
        background: c.bg, color: c.text,
        border: c.border || 'none',
        padding: '12px 24px', borderRadius: 12,
        fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: 14,
        zIndex: 9999, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        whiteSpace: 'nowrap', cursor: 'pointer',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      {toast.msg}
    </div>
  );
}

/* ── Backend wake-up screen (Render free tier spins down after inactivity) ── */
const API_BASE = import.meta.env.VITE_API_URL || '';

function WakeUpScreen() {
  const [dots, setDots] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', gap: 32,
    }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 48, letterSpacing: 3, color: 'var(--gold)' }}>
        CAPTAIN'S CALL
      </div>
      <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.05em' }}>
          WAKING UP SERVER{'.'}{'.'.repeat(dots)}
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4, background: 'var(--gold)',
            animation: 'wakeup-progress 25s linear forwards',
          }} />
        </div>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
          Free tier needs ~30s to start. Thanks for your patience.
        </div>
      </div>
      <style>{`
        @keyframes wakeup-progress {
          0%   { width: 0% }
          60%  { width: 70% }
          90%  { width: 90% }
          100% { width: 98% }
        }
      `}</style>
    </div>
  );
}

/* ── App shell ────────────────────────────────────────────────────────────── */
function AppContent() {
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
          if (res.ok) { if (!cancelled) setBackendReady(true); return; }
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
    };
    ping();
    return () => { cancelled = true; };
  }, []);

  if (!backendReady) return <WakeUpScreen />;

  return (
    <div style={{ minHeight: '100vh' }}>
      <Navbar />
      <Routes>
        <Route path="/"              element={<LoginScreen />} />
        <Route path="/pick"          element={<PickScreen />} />
        <Route path="/leaderboard"   element={<LeaderboardScreen />} />
        <Route path="/leaderboard/players" element={<Navigate to="/leaderboard" replace />} />
        <Route path="/team/:id"      element={<TeamSquadScreen />} />
        <Route path="/player/:id"    element={<PlayerHistoryScreen />} />
        <Route path="/admin/*"       element={<AdminScreen />} />
        <Route path="*"              element={<Navigate to="/" replace />} />
      </Routes>
      <GlobalToast />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
