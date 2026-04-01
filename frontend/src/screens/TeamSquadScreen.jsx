import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ROLE_LABELS = { BAT: 'BAT', BOWL: 'BOWL', BWL: 'BOWL', AR: 'AR', WK: 'WK' };

export default function TeamSquadScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState(null);
  const [matchScores, setMatchScores] = useState({});

  useEffect(() => {
    const load = async () => {
      try {
        const [squadRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/teams/${id}/public-squad`),
          fetch(`${API_BASE}/teams/${id}/captaincy-history`),
        ]);
        if (squadRes.ok) setData(await squadRes.json());
        if (histRes.ok) setHistory(await histRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const goBack = () =>
    location.state?.from === 'leaderboard' ? navigate('/leaderboard') : navigate(-1);

  const toggleMatch = async (matchId) => {
    if (expandedMatch === matchId) { setExpandedMatch(null); return; }
    setExpandedMatch(matchId);
    if (matchScores[matchId]) return;
    try {
      const res = await fetch(`${API_BASE}/teams/${id}/match/${matchId}/scores`);
      const data = await res.json();
      setMatchScores(prev => ({ ...prev, [matchId]: data }));
    } catch (e) {
      setMatchScores(prev => ({ ...prev, [matchId]: [] }));
    }
  };

  if (loading) {
    return (
      <div className="screen container" style={{ paddingTop: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="screen container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, color: 'var(--text-muted)' }}>Team not found.</div>
      </div>
    );
  }

  const { team, players } = data;
  const avgPts = team.matches_played > 0
    ? (team.total_pts / team.matches_played).toFixed(1) : '—';

  return (
    <div className="screen" style={{ minHeight: 'calc(100vh - 68px)', paddingBottom: 80 }}>
    <div className="container">

      {/* Back */}
      <div style={{ paddingTop: 28, marginBottom: 24 }}>
        <button
          onClick={goBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: "'Sora',sans-serif",
            fontSize: 13, fontWeight: 600, padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          ← Back to Standings
        </button>
      </div>

      {/* Team header card — full width */}
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '32px 40px',
        display: 'flex', alignItems: 'center', gap: 32,
        marginBottom: 40,
      }}>
        <div style={{
          width: 96, height: 96, borderRadius: 20, flexShrink: 0,
          background: team.color_hex || 'var(--gold)',
          boxShadow: `0 12px 40px ${team.color_hex || 'var(--gold)'}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Bebas Neue',sans-serif", fontSize: 44, color: '#000',
        }}>
          {team.team_code?.charAt(0) || team.name?.charAt(0)}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 48,
            lineHeight: 1, color: 'var(--text-primary)', letterSpacing: 1,
          }}>
            {team.name}
          </div>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--gold)', fontWeight: 600, marginTop: 6 }}>
            Manager: {team.owner_name}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 48 }}>
          {[
            { label: 'TOTAL PTS', value: team.total_pts, color: 'var(--gold)' },
            { label: 'AVG / MATCH', value: avgPts, color: 'var(--text-secondary)' },
            { label: 'PLAYERS', value: players.length, color: 'var(--text-secondary)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: s.color, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)', marginTop: 4, letterSpacing: '0.06em' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column body */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>

        {/* LEFT — Fantasy Squad */}
        <div>
          <div className="section-label" style={{ marginBottom: 16 }}>
            Fantasy Squad · {players.length} Players
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {players.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/player/${p.id}`, { state: { from: 'team' } })}
                style={{
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 16,
                  cursor: 'pointer', transition: 'var(--transition)',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--card-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--card)'}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                  background: team.color_hex ? `${team.color_hex}22` : 'var(--gold-glow)',
                  border: `1px solid ${team.color_hex || 'var(--gold)'}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 22,
                  color: team.color_hex || 'var(--gold)',
                }}>
                  {p.name.charAt(0)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                    {p.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge-${ROLE_LABELS[p.role] || p.role}`} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4 }}>
                      {ROLE_LABELS[p.role] || p.role}
                    </span>
                    <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)' }}>
                      {p.ipl_team}
                    </span>
                  </div>
                </div>

                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--gold)', flexShrink: 0 }}>
                  {p.total_pts}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Captaincy History */}
        <div>
          <div className="section-label" style={{ marginBottom: 16 }}>
            Past Captaincy Choices
          </div>

          {history.length === 0 ? (
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 32, textAlign: 'center',
              fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)',
            }}>
              No completed matches yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map(h => {
                const isOpen = expandedMatch === h.match_id;
                const scores = matchScores[h.match_id];
                return (
                  <div key={h.match_id} style={{
                    background: 'var(--card)', border: `1px solid ${isOpen ? 'rgba(245,158,11,0.4)' : 'var(--border)'}`,
                    borderRadius: 12, overflow: 'hidden',
                    transition: 'border-color 0.2s',
                  }}>
                    {/* Header — clickable */}
                    <div
                      onClick={() => toggleMatch(h.match_id)}
                      style={{ padding: 18, cursor: 'pointer' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div>
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {h.match_name}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {h.match_date}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--text-muted)', lineHeight: 1 }}>
                              {h.base_pts}
                            </div>
                            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)' }}>BASE</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--gold)', lineHeight: 1 }}>
                              {h.team_pts}
                            </div>
                            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)' }}>WITH C/VC</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{
                          background: 'var(--gold-glow)', border: '1px solid rgba(245,158,11,0.3)',
                          borderRadius: 20, padding: '4px 14px',
                          fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--gold)',
                        }}>
                          C: {h.captain_name}
                        </div>
                        {h.vc_name && h.vc_name !== 'Unknown' && (
                          <div style={{
                            background: 'var(--purple-glow)', border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: 20, padding: '4px 14px',
                            fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--purple)',
                          }}>
                            VC: {h.vc_name}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Expanded player breakdown */}
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px 16px' }}>
                        {!scores ? (
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                            Loading...
                          </div>
                        ) : scores.length === 0 ? (
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                            No scores recorded for this match.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {scores.map(s => (
                              <div key={s.player_id} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '7px 10px', borderRadius: 8,
                                background: s.is_captain ? 'rgba(245,158,11,0.07)' : s.is_vc ? 'rgba(139,92,246,0.07)' : 'transparent',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {s.player_name}
                                  </span>
                                  {s.is_captain && (
                                    <span style={{ background: 'var(--gold-glow)', color: 'var(--gold)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>C ×2</span>
                                  )}
                                  {s.is_vc && (
                                    <span style={{ background: 'var(--purple-glow)', color: 'var(--purple)', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>VC ×1.5</span>
                                  )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {s.multiplier > 1 && (
                                    <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)' }}>
                                      {s.base_pts} pts
                                    </span>
                                  )}
                                  <span style={{
                                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 22,
                                    color: s.is_captain ? 'var(--gold)' : s.is_vc ? 'var(--purple)' : 'var(--text-primary)',
                                  }}>
                                    {s.final_pts}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
    </div>
  );
}
