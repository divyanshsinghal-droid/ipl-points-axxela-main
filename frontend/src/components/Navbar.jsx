import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Navbar() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [team, setTeam] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('team');
    setTeam(stored ? JSON.parse(stored) : null);
  }, [location]);

  const isActive = (...paths) =>
    paths.some(p =>
      p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
    );

  const goToPick = () =>
    navigate(localStorage.getItem('token') ? '/pick' : '/');

  return (
    <nav className="nav">
    <div className="nav-inner">
      {/* ── Logo ── */}
      <div
        className="nav-logo"
        onClick={() => navigate('/leaderboard')}
        style={{ cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && navigate('/leaderboard')}
      >
        <div className="nav-logo-icon">🏆</div>
        <div className="nav-logo-text">
          CAPTAIN'S <span>CALL</span>
        </div>
      </div>

      {/* ── Links ── */}
      <div className="nav-links">
        <button
          className={`nav-link ${isActive('/leaderboard', '/team', '/player') ? 'active' : ''}`}
          onClick={() => navigate('/leaderboard')}
        >
          Leaderboard
        </button>
        <button
          className={`nav-link ${isActive('/pick', '/') ? 'active' : ''}`}
          onClick={goToPick}
        >
          Pick C/VC
        </button>
        <button
          className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
          onClick={() => navigate('/admin')}
        >
          Admin
        </button>
      </div>

      {/* ── Profile pill (visible only when logged in) ── */}
      {team && (
        <div
          className="nav-profile-pill"
          onClick={goToPick}
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && goToPick()}
        >
          <div
            className="nav-profile-avatar"
            style={{ background: team.color_hex || 'var(--gold)' }}
          >
            {team.team_code?.charAt(0)}
          </div>
          <span className="nav-profile-name">{team.name}</span>
        </div>
      )}
    </div>
    </nav>
  );
}
