import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../utils/toast';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ROLE_LABELS = { BAT: 'BAT', BOWL: 'BOWL', BWL: 'BOWL', AR: 'AR', WK: 'WK' };

const URGENCY = {
  green: { color: 'var(--green)',  bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)' },
  amber: { color: 'var(--gold)',   bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)' },
  red:   { color: 'var(--red)',    bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)'  },
  grey:  { color: 'var(--text-muted)', bg: 'rgba(75,85,99,0.08)', border: 'rgba(75,85,99,0.2)' },
};

export default function PickScreen() {
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const [squad, setSquad]         = useState([]);
  const [match, setMatch]         = useState(null);
  const [history, setHistory]     = useState([]);
  const [captainId, setCaptainId] = useState(null);
  const [vcId, setVcId]           = useState(null);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [teamMeta, setTeamMeta]   = useState(null);
  const [timeLeft, setTimeLeft]   = useState('');
  const [urgency, setUrgency]     = useState('green');
  const [isLocked, setIsLocked]   = useState(false);
  const [noMatch, setNoMatch]     = useState(false);
  // toast handled globally via showToast()

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { navigate('/'); return; }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      fetch(`${API_BASE}/teams`)
        .then(r => r.json())
        .then(teams => {
          const myTeam = teams.find(t => t.team_code === payload.team_code);
          if (!myTeam) { navigate('/'); return; }
          setTeamMeta({ id: myTeam.id, name: myTeam.name, color: myTeam.color_hex, owner: myTeam.owner_name });
          fetchSquad(myTeam.id, token);
        });
      fetchMatch(token);
      fetchHistory(token);
    } catch { navigate('/'); }
  }, [navigate]);

  const fetchSquad = async (teamId, token) => {
    const res = await fetch(`${API_BASE}/teams/${teamId}/squad`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSquad(await res.json());
  };

  const fetchMatch = async (token) => {
    const res = await fetch(`${API_BASE}/matches/current`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) { setNoMatch(true); return; }
    if (res.ok) {
      const data = await res.json();
      setMatch(data);
      startTimer(data.deadline);
    }
  };

  const fetchHistory = async (token) => {
    const res = await fetch(`${API_BASE}/picks/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setHistory(data);
      // Pre-fill existing pick for current match
      setMatch(prev => {
        if (!prev) return prev;
        const existing = data.find(h => h.match_id === prev.id);
        if (existing) {
          setCaptainId(existing.captain_player_id);
          setVcId(existing.vc_player_id);
        }
        return prev;
      });
    }
  };

  const startTimer = (deadlineStr) => {
    if (timerRef.current) clearInterval(timerRef.current);
    const deadline = new Date(deadlineStr).getTime();
    const tick = () => {
      const diff = deadline - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00:00');
        setUrgency('grey');
        setIsLocked(true);
        clearInterval(timerRef.current);
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      setUrgency(h >= 2 ? 'green' : h >= 1 ? 'amber' : 'red');
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const handleLockIn = async () => {
    if (!captainId || !vcId || !match || isLocked) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/picks/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ match_id: match.id, captain_player_id: captainId, vc_player_id: vcId }),
      });
      if (res.ok) {
        showToast('✅ Picks saved! You can change until match starts.', 'success');
        fetchHistory(token);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(`⚠️ ${err.detail || 'Failed to lock in'}`, 'error');
      }
    } catch { showToast('⚠️ Connection error', 'error'); }
  };

  const handleC = (e, pid) => {
    e.stopPropagation();
    if (isLocked) return;
    if (captainId === pid) { setCaptainId(null); return; }
    if (vcId === pid) setVcId(null);
    setCaptainId(pid);
  };

  const handleVC = (e, pid) => {
    e.stopPropagation();
    if (isLocked) return;
    if (vcId === pid) { setVcId(null); return; }
    if (captainId === pid) setCaptainId(null);
    setVcId(pid);
  };

  const filtered = roleFilter === 'ALL'
    ? [...squad].sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0))
    : [...squad].filter(p => {
        const r = ROLE_LABELS[p.role] || p.role;
        return r === roleFilter || p.role === roleFilter;
      }).sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0));

  const capPlayer = squad.find(p => p.id === captainId);
  const vcPlayer  = squad.find(p => p.id === vcId);
  const top3      = [...squad].sort((a, b) => (b.avg_pts || 0) - (a.avg_pts || 0)).slice(0, 3);
  const pastPicks = [...history]
    .filter(h => h.is_completed)
    .sort((a, b) => b.match_id - a.match_id)
    .slice(0, 3);

  const u = URGENCY[urgency];
  const hasExistingPick = history.some(h => match && h.match_id === match.id);
  const canLock = !!captainId && !!vcId && !isLocked && !!match;

  if (!teamMeta) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  return (
    <>
      <div className="screen container" style={{ paddingTop: 32, paddingBottom: 80 }}>

        {/* ── PAGE HEADER ── */}
        <div style={{ paddingTop: 24, marginBottom: 24 }}>
          {/* Eyebrow + Logout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{
              fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600,
              color: teamMeta.color || 'var(--gold)',
              letterSpacing: '0.05em',
            }}>
              {teamMeta.name} · {teamMeta.owner}
            </div>
            <button
              onClick={() => { localStorage.removeItem('token'); navigate('/'); }}
              style={{
                background: 'none', border: '1px solid rgba(239,68,68,0.3)',
                color: 'var(--red)', padding: '5px 12px', borderRadius: 8,
                fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.05em',
              }}
            >
              LOGOUT
            </button>
          </div>

          {/* Title */}
          <div style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 56, lineHeight: 1,
            color: 'var(--text-primary)', letterSpacing: 2, marginBottom: 20,
          }}>
            CHOOSE YOUR<br />
            <span style={{ color: 'var(--gold)' }}>CAPTAINS</span>
          </div>

          {/* Countdown banner */}
          {noMatch ? (
            <div style={{
              background: 'rgba(75,85,99,0.1)', border: '1px solid rgba(75,85,99,0.3)',
              borderRadius: 12, padding: '14px 18px',
              fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)',
              textAlign: 'center',
            }}>
              No upcoming match scheduled
            </div>
          ) : (
            <div style={{
              background: u.bg, border: `1px solid ${u.border}`,
              borderRadius: 12, padding: '14px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, color: u.color, letterSpacing: '0.08em', marginBottom: 4 }}>
                  PICK FOR
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text-primary)', letterSpacing: 1, lineHeight: 1 }}>
                  {match ? `${match.team1} v ${match.team2}` : '—'}
                </div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {match ? `Deadline ${new Date(match.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: u.color, lineHeight: 1 }}>
                  {timeLeft || '—'}
                </div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)' }}>
                  TIME LEFT
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── TWO COLUMN LAYOUT ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>

          {/* ── LEFT COLUMN ── */}
          <div>

            {/* Selection slots */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { key: 'C', label: 'Captain', mult: '2.0×', player: capPlayer, color: 'var(--gold)', border: 'rgba(245,158,11,0.5)', bg: 'var(--gold-glow)', clear: () => setCaptainId(null) },
                { key: 'VC', label: 'Vice Captain', mult: '1.5×', player: vcPlayer, color: 'var(--purple)', border: 'rgba(139,92,246,0.5)', bg: 'var(--purple-glow)', clear: () => setVcId(null) },
              ].map(slot => (
                <div
                  key={slot.key}
                  onClick={slot.player && !isLocked ? slot.clear : undefined}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    padding: 16, borderRadius: 16, minHeight: 90,
                    border: slot.player ? `1px solid ${slot.border}` : '2px dashed var(--border)',
                    background: slot.player ? slot.bg : 'transparent',
                    cursor: slot.player && !isLocked ? 'pointer' : 'default',
                    transition: 'var(--transition)',
                  }}
                >
                  {/* Watermark */}
                  <div style={{
                    position: 'absolute', bottom: -8, right: 4,
                    fontFamily: "'Bebas Neue',sans-serif", fontSize: 72,
                    color: slot.color, opacity: 0.08, lineHeight: 1,
                    pointerEvents: 'none', userSelect: 'none',
                  }}>
                    {slot.key}
                  </div>

                  <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', marginBottom: 6 }}>
                    {slot.label} <span style={{ color: slot.color }}>{slot.mult}</span>
                  </div>

                  {slot.player ? (
                    <div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                        {slot.player.name}
                      </div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: slot.color, marginTop: 4 }}>
                        Avg {slot.player.avg_pts} pts
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)' }}>
                      Tap [C] below
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Squad list card */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', overflow: 'hidden',
            }}>
              {/* Card header */}
              <div style={{
                padding: '14px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  Squad List
                </div>
                {/* Role filter pills */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {['ALL', 'BAT', 'BOWL', 'AR', 'WK'].map(r => (
                    <button
                      key={r}
                      onClick={() => setRoleFilter(r)}
                      style={{
                        background: roleFilter === r ? 'var(--gold)' : 'transparent',
                        border: `1px solid ${roleFilter === r ? 'var(--gold)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '3px 6px',
                        fontFamily: "'Sora',sans-serif", fontSize: 9, fontWeight: 700,
                        color: roleFilter === r ? '#000' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'var(--transition)',
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Player rows */}
              {filtered.map((p, idx) => {
                const isCap = captainId === p.id;
                const isVc  = vcId === p.id;
                const role  = ROLE_LABELS[p.role] || p.role;
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/player/${p.id}`, { state: { from: 'pick' } })}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 1fr 44px 60px',
                      gap: 8,
                      padding: '10px 16px',
                      borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: isCap ? 'rgba(245,158,11,0.05)' : isVc ? 'rgba(139,92,246,0.05)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isCap && !isVc) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isCap ? 'rgba(245,158,11,0.05)' : isVc ? 'rgba(139,92,246,0.05)' : 'transparent'; }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: isCap ? 'var(--gold)' : isVc ? 'var(--purple)' : 'rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
                      color: (isCap || isVc) ? '#000' : 'var(--text-muted)',
                      transition: 'var(--transition)',
                    }}>
                      {isCap ? 'C' : isVc ? 'VC' : p.name.charAt(0)}
                    </div>

                    {/* Name + badge */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <span className={`badge-${role}`} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3 }}>
                          {role}
                        </span>
                        <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.ipl_team}
                        </span>
                      </div>
                    </div>

                    {/* Avg pts */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--gold)', lineHeight: 1 }}>
                        {p.avg_pts || 0}
                      </div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 8, color: 'var(--text-muted)' }}>avg</div>
                    </div>

                    {/* C / VC buttons */}
                    <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleC(e, p.id)}
                        disabled={isLocked}
                        style={{
                          flex: 1,
                          background: isCap ? 'var(--gold)' : 'transparent',
                          border: `1px solid ${isCap ? 'var(--gold)' : 'var(--border)'}`,
                          borderRadius: 6, padding: '4px 0',
                          fontFamily: "'Bebas Neue',sans-serif", fontSize: 13,
                          color: isCap ? '#000' : 'var(--text-muted)',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          transition: 'var(--transition)',
                        }}
                      >
                        C
                      </button>
                      <button
                        onClick={e => handleVC(e, p.id)}
                        disabled={isLocked}
                        style={{
                          flex: 1,
                          background: isVc ? 'var(--purple)' : 'transparent',
                          border: `1px solid ${isVc ? 'var(--purple)' : 'var(--border)'}`,
                          borderRadius: 6, padding: '4px 0',
                          fontFamily: "'Bebas Neue',sans-serif", fontSize: 11,
                          color: isVc ? '#fff' : 'var(--text-muted)',
                          cursor: isLocked ? 'not-allowed' : 'pointer',
                          transition: 'var(--transition)',
                        }}
                      >
                        VC
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Tips card */}
            <div style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 14,
            }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.05em', marginBottom: 10 }}>
                Quick Tips
              </div>
              {top3.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {top3.map((p, i) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: '50%',
                        background: i === 0 ? 'var(--gold-glow)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${i === 0 ? 'var(--gold)' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Bebas Neue',sans-serif", fontSize: 10,
                        color: i === 0 ? 'var(--gold)' : 'var(--text-muted)',
                        flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.name.split(' ').pop()}
                        </div>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--gold)' }}>
                          {p.avg_pts} avg
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Pick captains based on form and match-ups.
                </div>
              )}
            </div>

            {/* Lock In button */}
            <button
              onClick={handleLockIn}
              disabled={!canLock}
              style={{
                width: '100%',
                background: isLocked ? 'var(--green)' : canLock ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                border: 'none', borderRadius: 12, padding: '14px 8px',
                fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: '0.05em',
                color: isLocked ? '#fff' : canLock ? 'var(--bg)' : 'var(--text-muted)',
                cursor: !canLock ? 'not-allowed' : 'pointer',
                opacity: !canLock && !isLocked ? 0.4 : 1,
                transition: 'var(--transition)',
                lineHeight: 1.2,
              }}
            >
              {isLocked ? '🔒 MATCH\nSTARTED' : hasExistingPick ? 'UPDATE\nPICKS' : 'LOCK IN\nSELECTION'}
            </button>

            {/* History card */}
            {pastPicks.length > 0 && (
              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: 14,
              }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, color: 'var(--text-primary)', letterSpacing: '0.05em', marginBottom: 10 }}>
                  Last Picks
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pastPicks.map(h => (
                    <div key={h.id} style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.match_date}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{
                          background: 'var(--gold-glow)', border: '1px solid rgba(245,158,11,0.3)',
                          borderRadius: 8, padding: '3px 8px',
                          fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--gold)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          C: {h.captain_name}
                        </div>
                        <div style={{
                          background: 'var(--purple-glow)', border: '1px solid rgba(139,92,246,0.3)',
                          borderRadius: 8, padding: '3px 8px',
                          fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--purple)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          VC: {h.vc_name}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate('/leaderboard')}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600,
                    color: 'var(--text-muted)', padding: '6px 0 0', width: '100%', textAlign: 'left',
                  }}
                >
                  View all history →
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
