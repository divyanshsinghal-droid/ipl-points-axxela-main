import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../utils/toast';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function LoginScreen() {
  const [teams, setTeams]           = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [password, setPassword]     = useState('');
  const [error, setError]           = useState('');
  const [isLoading, setIsLoading]   = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_BASE}/teams`)
      .then(r => r.json())
      .then(data => setTeams(data))
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!selectedTeam) { setError('Please select a team.'); return; }
    if (!password)     { setError('Password cannot be empty.'); return; }

    setIsLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/team-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_code: selectedTeam.team_code, password }),
      });

      if (!res.ok) {
        setError(res.status === 401 ? 'Wrong password. Try again.' : 'Login failed.');
        return;
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('team', JSON.stringify({
        id: selectedTeam.id, name: selectedTeam.name,
        team_code: selectedTeam.team_code, owner_name: selectedTeam.owner_name,
        color_hex: selectedTeam.color_hex,
      }));
      showToast(`✅ Welcome, ${selectedTeam.owner_name}!`, 'success');
      setTimeout(() => navigate('/pick'), 600);
    } catch {
      setError('Connection error. Is the server running?');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="screen" style={{ minHeight: 'calc(100vh - 68px)', display: 'flex' }}>

      {/* ── LEFT: Branding panel ── */}
      <div style={{
        flex: '0 0 42%',
        background: 'linear-gradient(160deg, rgba(245,158,11,0.08) 0%, rgba(139,92,246,0.06) 100%)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '64px 72px',
      }}>
        {/* Pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--gold-glow)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 20, padding: '6px 16px', width: 'fit-content',
          fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600,
          color: 'var(--gold)', marginBottom: 32, letterSpacing: '0.5px',
        }}>
          🏆 IPL Fantasy 2026
        </div>

        {/* Headline */}
        <div style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 88, lineHeight: 0.9, letterSpacing: 3, marginBottom: 28,
        }}>
          <span style={{ color: 'var(--text-primary)' }}>CAPTAIN'S</span>
          <br />
          <span style={{ color: 'var(--gold)' }}>CALL</span>
        </div>

        <p style={{
          fontFamily: "'Sora',sans-serif", fontSize: 16, lineHeight: 1.7,
          color: 'var(--text-muted)', maxWidth: 380, marginBottom: 48,
        }}>
          Pick your Captain and Vice Captain every match day.
          Outwit your friends. Climb the leaderboard.
        </p>

        {/* Feature list */}
        {[
          { icon: '⚡', text: 'Live score sync via Cricket API' },
          { icon: '🏅', text: 'Real-time fantasy leaderboard' },
          { icon: '🔒', text: 'Picks locked before match deadline' },
        ].map(f => (
          <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>{f.icon}</span>
            <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, color: 'var(--text-secondary)' }}>
              {f.text}
            </span>
          </div>
        ))}
      </div>

      {/* ── RIGHT: Login form ── */}
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 80px',
      }}>
        <div style={{ width: '100%', maxWidth: 560 }}>

          <div style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 40,
            letterSpacing: 2, marginBottom: 8, color: 'var(--text-primary)',
          }}>
            SIGN IN
          </div>
          <div style={{
            fontFamily: "'Sora',sans-serif", fontSize: 14,
            color: 'var(--text-muted)', marginBottom: 40,
          }}>
            Select your team, enter your password to get started
          </div>

          <form onSubmit={handleLogin}>
            {/* Section label */}
            <div className="section-label" style={{ marginBottom: 14 }}>Select Your Team</div>

            {/* Team Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10, marginBottom: 36,
            }}>
              {teams.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} className="skeleton" style={{ flex: 1, height: 90, borderRadius: 12 }} />
                  ))}
                </div>
              ) : teams.map(team => {
                const isSelected = selectedTeam?.id === team.id;
                return (
                  <div
                    key={team.id}
                    onClick={() => { setSelectedTeam(team); setError(''); }}
                    style={{
                      background: isSelected ? 'var(--gold-glow)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isSelected ? 'var(--gold)' : 'var(--border)'}`,
                      borderRadius: 12, padding: '14px 8px',
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', gap: 8,
                      cursor: 'pointer', transition: 'var(--transition)',
                    }}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; } }}
                    onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'var(--border)'; } }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: team.color_hex || 'var(--gold)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000',
                    }}>
                      {team.team_code?.charAt(0) || team.name?.charAt(0)}
                    </div>
                    <div style={{
                      fontFamily: "'Sora',sans-serif", fontSize: 9, fontWeight: 600,
                      color: isSelected ? 'var(--gold)' : 'var(--text-secondary)',
                      textAlign: 'center', lineHeight: 1.3, letterSpacing: '0.3px',
                    }}>
                      {team.name}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section label */}
            <div className="section-label" style={{ marginBottom: 10 }}>Enter Password</div>

            {/* Password row */}
            <div style={{
              display: 'flex', height: 54, overflow: 'hidden',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 12, marginBottom: 8, transition: 'border-color 0.2s',
            }}>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder="Team password..."
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.03)',
                  border: 'none', outline: 'none',
                  padding: '0 20px', fontFamily: "'Sora',sans-serif",
                  fontSize: 14, color: 'var(--text-primary)', borderRadius: 0,
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !selectedTeam}
                style={{
                  background: isLoading || !selectedTeam ? '#374151' : 'var(--gold)',
                  color: isLoading || !selectedTeam ? 'var(--text-muted)' : '#000',
                  border: 'none', padding: '0 28px',
                  cursor: isLoading || !selectedTeam ? 'not-allowed' : 'pointer',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1,
                  transition: 'var(--transition)', whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                {isLoading ? '...' : 'ENTER →'}
              </button>
            </div>

            {error && (
              <div style={{ color: 'var(--red)', fontSize: 12, fontFamily: "'Sora',sans-serif", marginBottom: 8 }}>
                {error}
              </div>
            )}

            <div style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: "'Sora',sans-serif", marginTop: 8 }}>
              🔒 Picks are private until match deadline
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
