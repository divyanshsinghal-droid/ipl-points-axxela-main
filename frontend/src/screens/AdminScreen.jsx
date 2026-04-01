import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

/* ─── Toast hook ─────────────────────────────────────────────────────────── */
function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const show = (msg, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 3000);
  };
  return { toast, show };
}

/* ─── Login screen ───────────────────────────────────────────────────────── */
function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('admin_token', data.access_token);
        onLogin();
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 40, width: '100%', maxWidth: 360,
      }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 8 }}>
          COMMISSIONER PANEL
        </div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, letterSpacing: 2, marginBottom: 32 }}>
          <span style={{ color: 'var(--text-primary)' }}>ADMIN </span>
          <span style={{ color: 'var(--gold)' }}>LOGIN</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: 8 }}>
            ADMIN PASSWORD
          </div>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            style={{
              width: '100%', background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 10, padding: '12px 16px', color: 'var(--text-primary)',
              fontFamily: "'Sora',sans-serif", fontSize: 14, marginBottom: error ? 8 : 20,
              boxSizing: 'border-box', outline: 'none',
            }}
          />
          {error && <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--red)', marginBottom: 16 }}>{error}</div>}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: 14, background: loading ? 'rgba(255,255,255,0.06)' : 'var(--gold)',
              color: loading ? 'var(--text-muted)' : 'var(--bg)',
              border: 'none', borderRadius: 10,
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '...' : 'VERIFY IDENTITY'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ─── Main admin panel ───────────────────────────────────────────────────── */
export default function AdminScreen() {
  const [isAuth, setIsAuth]     = useState(!!localStorage.getItem('admin_token'));
  const [picks, setPicks]       = useState([]);
  const [matches, setMatches]   = useState([]);
  const [syncLog, setSyncLog]   = useState(null);
  const [adjustState, setAdjustState] = useState(null);    // { matchId, players, playerId, points, basePts }
  const [auditState, setAuditState]   = useState(null);    // { matchId, data }
  const [setCaptainState, setSetCaptainState] = useState(null); // { matchId, teamId, teamName, players, captainId, vcId }
  const [matchPicksState, setMatchPicksState] = useState(null); // { match, teams }
  const [cricketLiveIds, setCricketLiveIds] = useState({});    // { matchId: string }
  const { toast, show: showToast } = useToast();

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_token')}` });

  const loadData = async () => {
    try {
      const [rPicks, rMatches] = await Promise.all([
        fetch(`${API_BASE}/admin/picks/today`, { headers: authHeader() }),
        fetch(`${API_BASE}/admin/matches`,     { headers: authHeader() }),
      ]);
      if (rPicks.status === 401 || rMatches.status === 401) { handleLogout(); return; }
      if (rPicks.ok)   setPicks(await rPicks.json());
      if (rMatches.ok) {
        const ms = await rMatches.json();
        setMatches(ms);
        setCricketLiveIds(prev => {
          const init = {};
          ms.forEach(m => { init[m.id] = prev[m.id] ?? (m.cricket_live_match_id ? String(m.cricket_live_match_id) : ''); });
          return init;
        });
      }
    } catch { showToast('Failed to load data', 'error'); }
  };

  useEffect(() => { if (isAuth) loadData(); }, [isAuth]);

  const handleLogout = () => { localStorage.removeItem('admin_token'); setIsAuth(false); };

  const handleForceSync = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/force-sync-schedule`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Schedule synced — ${data.matches_in_db} matches in DB`);
        loadData();
      } else {
        showToast(`❌ Sync failed — check API key`, 'error');
      }
    } catch { showToast('❌ Network error', 'error'); }
  };

  const handleSync = async (matchId) => {
    setSyncLog({ matchId, loading: true });
    try {
      const clId = cricketLiveIds[matchId]?.trim();
      const qs = clId ? `?cricket_live_id=${clId}` : '';
      const res = await fetch(`${API_BASE}/admin/sync-match/${matchId}${qs}`, { method: 'POST', headers: authHeader() });
      const data = await res.json();
      if (res.ok) {
        setSyncLog({ matchId, status: data.status, synced: data.synced_players || 0, unmatched: data.unmatched || [], matched: data.matched || [], message: data.message || null, dotsSynced: data.dots_synced ?? false, dotsApplied: data.dots_applied || [] });
        showToast(`✅ Synced ${data.synced_players || 0} players`);
        loadData();
      } else {
        setSyncLog({ matchId, status: 'error', message: data.detail || JSON.stringify(data) });
        showToast(`❌ Sync failed`, 'error');
      }
    } catch (e) {
      setSyncLog({ matchId, status: 'error', message: e.message });
      showToast(`❌ Network error`, 'error');
    }
  };

  const handleOpenAdjust = async (matchId) => {
    const res = await fetch(`${API_BASE}/admin/players-for-match/${matchId}`, { headers: authHeader() });
    if (res.ok) {
      const players = await res.json();
      setAdjustState({ matchId, players, playerId: '', points: '', basePts: '' });
    }
  };

  const handleAdjustSubmit = async () => {
    if (!adjustState.playerId) { showToast('Select a player', 'error'); return; }
    const hasManual = adjustState.points !== '' && !isNaN(parseFloat(adjustState.points));
    const hasBase   = adjustState.basePts !== '' && !isNaN(parseFloat(adjustState.basePts));
    if (!hasManual && !hasBase) { showToast('Enter at least one value to update', 'error'); return; }
    let url = `${API_BASE}/admin/adjust-points/${adjustState.matchId}/${adjustState.playerId}?points=${hasManual ? parseFloat(adjustState.points) : 0}`;
    if (hasBase) url += `&base_pts=${parseFloat(adjustState.basePts)}`;
    const res = await fetch(url, { method: 'POST', headers: authHeader() });
    if (res.ok) {
      const d = await res.json();
      showToast(`✅ base: ${d.fantasy_points_base}  manual: ${d.manual_points}  final: ${d.fantasy_points_final}`);
      handleOpenAdjust(adjustState.matchId);
    } else {
      showToast('❌ Adjustment failed', 'error');
    }
  };

  const handleAudit = async (matchId) => {
    const res = await fetch(`${API_BASE}/admin/audit/${matchId}`, { headers: authHeader() });
    if (res.ok) setAuditState({ matchId, data: await res.json() });
    else showToast('❌ Audit failed', 'error');
  };

  const handleOverride = async (teamId) => {
    if (!window.confirm("Clear this team's pick?")) return;
    const res = await fetch(`${API_BASE}/admin/override-pick/${teamId}`, { method: 'POST', headers: authHeader() });
    if (res.ok) { showToast("✅ Pick cleared"); loadData(); }
    else showToast('❌ Override failed', 'error');
  };

  const handleOpenSetCaptain = async (pick) => {
    const res = await fetch(`${API_BASE}/admin/team-players/${pick.team_id}`, { headers: authHeader() });
    if (!res.ok) { showToast('❌ Failed to load squad', 'error'); return; }
    const players = await res.json();
    setSetCaptainState({
      matchId: pick.match_id,
      teamId: pick.team_id,
      teamName: pick.team_name,
      players,
      captainId: pick.captain_player_id || '',
      vcId: pick.vc_player_id || '',
    });
  };

  const handleSetCaptainSubmit = async () => {
    const { matchId, teamId, captainId, vcId } = setCaptainState;
    if (!captainId) { showToast('Select a Captain', 'error'); return; }
    if (vcId && captainId === vcId) { showToast('Captain and VC must be different players', 'error'); return; }
    const res = await fetch(`${API_BASE}/admin/set-pick`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: matchId,
        team_id: teamId,
        captain_player_id: parseInt(captainId),
        vc_player_id: parseInt(vcId),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      showToast(`✅ Set: C: ${d.captain} · VC: ${d.vc}`);
      const onDone = setCaptainState.onDone;
      setSetCaptainState(null);
      if (onDone) onDone(); else loadData();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`❌ ${err.detail || 'Failed'}`, 'error');
    }
  };

  const handleOpenMatchPicks = async (match) => {
    const res = await fetch(`${API_BASE}/admin/picks/match/${match.id}`, { headers: authHeader() });
    if (!res.ok) { showToast('❌ Failed to load picks', 'error'); return; }
    setMatchPicksState({ match, teams: await res.json() });
  };

  const refreshMatchPicks = async () => {
    if (!matchPicksState) return;
    const res = await fetch(`${API_BASE}/admin/picks/match/${matchPicksState.match.id}`, { headers: authHeader() });
    if (res.ok) setMatchPicksState(s => ({ ...s, teams: [] }));
    const data = await res.json();
    setMatchPicksState(s => ({ ...s, teams: data }));
  };

  if (!isAuth) return <AdminLogin onLogin={() => setIsAuth(true)} />;

  const submittedCount = picks.filter(p => p.submitted).length;
  const currentMatch = matches.find(m => !m.is_completed);
  const matchTitle = currentMatch ? `${currentMatch.team1} vs ${currentMatch.team2}` : 'No active match';

  return (
    <>
      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 30, left: '50%',
          transform: toast ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(20px)',
          background: 'var(--card)', border: '1px solid var(--gold)',
          borderRadius: 30, padding: '12px 24px', zIndex: 9999,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600,
          color: toast.type === 'error' ? 'var(--red)' : 'var(--text-primary)',
          whiteSpace: 'nowrap',
          animation: 'slideUp 0.25s ease-out',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Adjust Points Modal */}
      {adjustState && (
        <>
          <div onClick={() => setAdjustState(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 420, zIndex: 301,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#93c5fd', letterSpacing: '0.05em' }}>
                ADJUST PLAYER POINTS
              </div>
              <button onClick={() => setAdjustState(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em' }}>SELECT PLAYER</div>
              <select
                value={adjustState.playerId}
                onChange={e => setAdjustState(s => ({ ...s, playerId: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif", fontSize: 13 }}
              >
                <option value="">— Select player —</option>
                {adjustState.players.map(p => (
                  <option key={p.player_id} value={p.player_id}>
                    {p.player_name} (base: {p.fantasy_points_base}, +{p.manual_points} manual)
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em' }}>SET BASE PTS (override)</div>
                <input
                  type="number"
                  placeholder="e.g. 48"
                  value={adjustState.basePts}
                  onChange={e => setAdjustState(s => ({ ...s, basePts: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif", fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
              <div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.06em' }}>ADD / SUBTRACT PTS</div>
                <input
                  type="number"
                  placeholder="e.g. 10 or -5"
                  value={adjustState.points}
                  onChange={e => setAdjustState(s => ({ ...s, points: e.target.value }))}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif", fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>
            <button
              onClick={handleAdjustSubmit}
              style={{ width: '100%', padding: 12, background: 'rgba(59,130,246,0.8)', color: '#fff', border: 'none', borderRadius: 8, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, cursor: 'pointer', marginBottom: 10 }}
            >
              APPLY ADJUSTMENT
            </button>
            {adjustState.playerId && (
              <button
                onClick={async () => {
                  if (!window.confirm('Delete this player\'s entire score entry for this match? This cannot be undone.')) return;
                  const res = await fetch(`${API_BASE}/admin/match-score/${adjustState.matchId}/${adjustState.playerId}`, { method: 'DELETE', headers: authHeader() });
                  if (res.ok) {
                    showToast('🗑️ Score entry deleted');
                    setAdjustState(null);
                    loadData();
                  } else {
                    showToast('❌ Delete failed', 'error');
                  }
                }}
                style={{ width: '100%', padding: 10, background: 'transparent', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', cursor: 'pointer' }}
              >
                🗑️ DELETE SCORE ENTRY FOR THIS MATCH
              </button>
            )}
          </div>
        </>
      )}

      {/* Audit Modal */}
      {auditState && (
        <>
          <div onClick={() => setAuditState(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 520,
            maxHeight: '80vh', overflowY: 'auto', zIndex: 301,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--gold)', letterSpacing: '0.05em' }}>POINTS AUDIT</div>
              <button onClick={() => setAuditState(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {auditState.data.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 8,
                  background: a.is_c ? 'var(--gold-glow)' : a.is_vc ? 'var(--purple-glow)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${a.is_c ? 'rgba(245,158,11,0.2)' : a.is_vc ? 'rgba(139,92,246,0.2)' : 'var(--border)'}`,
                }}>
                  <div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {a.player_name}
                      {a.is_c && <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, background: 'var(--gold)', color: '#000', padding: '1px 5px', borderRadius: 3 }}>C</span>}
                      {a.is_vc && <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, background: 'var(--purple)', color: '#fff', padding: '1px 5px', borderRadius: 3 }}>VC</span>}
                    </div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{a.team}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--green)', lineHeight: 1 }}>{a.final_pts}</div>
                    <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)' }}>{a.base_pts} × {a.multiplier}</div>
                  </div>
                </div>
              ))}
              {auditState.data.length === 0 && (
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No scores synced for this match.</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Match Picks Modal */}
      {matchPicksState && (
        <>
          <div onClick={() => setMatchPicksState(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 600,
            maxHeight: '80vh', overflowY: 'auto', zIndex: 301,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  CAPTAIN PICKS
                </div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {matchPicksState.match.team1} vs {matchPicksState.match.team2}
                  <span style={{ marginLeft: 8, color: matchPicksState.match.is_completed ? 'var(--green)' : 'var(--gold)', fontWeight: 700 }}>
                    {matchPicksState.match.is_completed ? '✓ Completed' : '⏳ Upcoming'}
                  </span>
                </div>
              </div>
              <button onClick={() => setMatchPicksState(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Team', 'Captain', 'Vice Captain', ''].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matchPicksState.teams.map((t, idx) => (
                  <tr key={t.team_id} style={{ borderBottom: idx < matchPicksState.teams.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '12px 12px' }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.team_name}</div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)' }}>{t.owner}</div>
                    </td>
                    <td style={{ padding: '12px 12px', fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: t.c_name ? 'var(--gold)' : 'var(--text-muted)' }}>
                      {t.c_name || '—'}
                    </td>
                    <td style={{ padding: '12px 12px', fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: t.vc_name ? 'var(--purple)' : 'var(--text-muted)' }}>
                      {t.vc_name || '—'}
                    </td>
                    <td style={{ padding: '12px 12px' }}>
                      <button
                        onClick={async () => {
                          const res = await fetch(`${API_BASE}/admin/team-players/${t.team_id}`, { headers: authHeader() });
                          if (!res.ok) { showToast('❌ Failed to load squad', 'error'); return; }
                          const players = await res.json();
                          setSetCaptainState({
                            matchId: t.match_id,
                            teamId: t.team_id,
                            teamName: t.team_name,
                            players,
                            captainId: t.captain_player_id || '',
                            vcId: t.vc_player_id || '',
                            onDone: refreshMatchPicks,
                          });
                        }}
                        style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--gold)', padding: '4px 10px', borderRadius: 6, fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
                      >
                        SET C/VC
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Set Captain / VC Modal */}
      {setCaptainState && (
        <>
          <div onClick={() => setSetCaptainState(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 300 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--card)', border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: 'var(--radius)', padding: 28, width: '100%', maxWidth: 440, zIndex: 301,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--gold)', letterSpacing: '0.05em' }}>
                SET CAPTAIN &amp; VICE CAPTAIN
              </div>
              <button onClick={() => setSetCaptainState(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              {setCaptainState.teamName} · Admin override (ignores deadline)
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--gold)', marginBottom: 6, letterSpacing: '0.06em' }}>CAPTAIN (2× pts)</div>
              <select
                value={setCaptainState.captainId}
                onChange={e => setSetCaptainState(s => ({ ...s, captainId: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif", fontSize: 13 }}
              >
                <option value="">— Select Captain —</option>
                {setCaptainState.players.map(p => (
                  <option key={p.id} value={p.id} disabled={String(p.id) === String(setCaptainState.vcId)}>
                    {p.name} ({p.role} · {p.ipl_team})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--purple)', marginBottom: 6, letterSpacing: '0.06em' }}>VICE CAPTAIN (1.5× pts) — optional</div>
              <select
                value={setCaptainState.vcId}
                onChange={e => setSetCaptainState(s => ({ ...s, vcId: e.target.value }))}
                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8, padding: '10px 12px', color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif", fontSize: 13 }}
              >
                <option value="">— No Vice Captain —</option>
                {setCaptainState.players.map(p => (
                  <option key={p.id} value={p.id} disabled={String(p.id) === String(setCaptainState.captainId)}>
                    {p.name} ({p.role} · {p.ipl_team})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSetCaptainSubmit}
              style={{ width: '100%', padding: 12, background: 'var(--gold)', color: '#000', border: 'none', borderRadius: 8, fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 1, cursor: 'pointer', fontWeight: 700 }}
            >
              CONFIRM PICKS
            </button>
          </div>
        </>
      )}

      <div style={{ minHeight: 'calc(100vh - 68px)', paddingBottom: 80 }}>
        {/* ── PAGE HEADER ── */}
        <div className="container" style={{ paddingTop: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 6 }}>
                Commissioner Panel
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 56, lineHeight: 1, letterSpacing: 2 }}>
                <span style={{ color: 'var(--text-primary)' }}>ADMIN </span>
                <span style={{ color: 'var(--gold)' }}>PANEL</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 16 }}>
              <button
                onClick={handleForceSync}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 8, fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}
              >
                FORCE SYNC
              </button>
              <button
                onClick={handleLogout}
                style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--red)', padding: '8px 16px', borderRadius: 8, fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                LOGOUT
              </button>
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 32 }}>

          {/* ── SECTION 1: TODAY'S PICKS ── */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 48, overflow: 'hidden' }}>

            {/* Card header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                Today's Picks ({matchTitle})
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: '4px 14px', fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--green)' }}>{submittedCount}</span>
                {' / '}{picks.length} Teams Submitted
              </div>
            </div>

            {/* Table */}
            {picks.length === 0 ? (
              <div style={{ padding: '32px 24px', textAlign: 'center', fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)' }}>
                No upcoming match or no teams yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Team', 'Captain', 'Vice Captain', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', background: 'rgba(255,255,255,0.01)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {picks.map((t, idx) => (
                    <tr
                      key={t.team_id}
                      style={{
                        borderBottom: idx < picks.length - 1 ? '1px solid var(--border)' : 'none',
                        background: t.submitted ? 'transparent' : 'rgba(239,68,68,0.03)',
                      }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{t.team_name}</div>
                        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{t.owner}</div>
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: t.c_name ? 'var(--gold)' : 'var(--text-muted)' }}>
                        {t.c_name || '—'}
                      </td>
                      <td style={{ padding: '14px 16px', fontFamily: "'Sora',sans-serif", fontSize: 13, fontWeight: 600, color: t.vc_name ? 'var(--purple)' : 'var(--text-muted)' }}>
                        {t.vc_name || '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {t.submitted ? (
                          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>● Submitted</span>
                        ) : (
                          <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--gold)' }}>○ Pending</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => handleOpenSetCaptain(t)}
                            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--gold)', padding: '4px 10px', borderRadius: 6, fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}
                          >
                            SET C/VC
                          </button>
                          {t.submitted && (
                            <button
                              onClick={() => handleOverride(t.team_id)}
                              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--red)', padding: '4px 10px', borderRadius: 6, fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em' }}
                            >
                              CLEAR
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── SECTION 2: MATCH MANAGEMENT ── */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 6 }}>
              Schedule &amp; Operations
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, color: 'var(--text-primary)', letterSpacing: 2 }}>
              MATCH MANAGEMENT
            </div>
          </div>

          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 48 }}>
            {matches.length === 0 ? (
              <div style={{ padding: 32, background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)', borderRadius: 12, textAlign: 'center', fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)' }}>
                No matches synced yet. Use "Force Sync" to import the schedule.
              </div>
            ) : matches.map(m => (
              <div key={m.id}>
                <div style={{
                  background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: 24,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  flexWrap: 'wrap', gap: 16,
                }}>
                  {/* Left: match info */}
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--text-primary)', letterSpacing: 1, lineHeight: 1 }}>
                      {m.team1} vs {m.team2}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{
                        fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 800,
                        color: m.is_completed ? 'var(--green)' : 'var(--gold)',
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                      }}>
                        {m.is_completed ? '✓ COMPLETED' : '⏳ UPCOMING'}
                      </span>
                      <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>
                        {new Date(m.match_date).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </div>

                  {/* Right: action buttons */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 150 }}>
                    {/* Cricket Live ID input */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input
                        type="number"
                        placeholder="Cricket Live ID"
                        value={cricketLiveIds[m.id] ?? ''}
                        onChange={e => setCricketLiveIds(prev => ({ ...prev, [m.id]: e.target.value }))}
                        style={{
                          flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 6, fontSize: 11,
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,130,246,0.3)',
                          color: 'var(--text-primary)', fontFamily: "'Sora',sans-serif",
                        }}
                      />
                      <button
                        onClick={async () => {
                          const clId = cricketLiveIds[m.id]?.trim();
                          const res = await fetch(`${API_BASE}/admin/matches/${m.id}/cricket-live-id?cricket_live_id=${clId || ''}`, { method: 'PUT', headers: authHeader() });
                          if (res.ok) showToast('✅ Cricket Live ID saved');
                          else showToast('❌ Failed to save', 'error');
                        }}
                        title="Save Cricket Live ID"
                        style={{
                          padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', background: 'rgba(59,130,246,0.15)',
                          border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd',
                        }}
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={() => handleSync(m.id)}
                      style={syncLog?.matchId === m.id && syncLog?.loading ? {
                        padding: '10px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', border: '1px solid rgba(59,130,246,0.4)', background: 'rgba(59,130,246,0.15)', color: '#93c5fd', opacity: 0.7,
                      } : {
                        padding: '10px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,130,246,0.4)', color: 'var(--text-secondary)',
                      }}
                    >
                      {syncLog?.matchId === m.id && syncLog?.loading ? '⏳ Syncing...' : 'Sync Scores'}
                    </button>
                    <button
                      onClick={() => handleOpenAdjust(m.id)}
                      style={{ padding: '10px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd' }}
                    >
                      Adjust Points
                    </button>
                    <button
                      onClick={() => handleAudit(m.id)}
                      style={{ padding: '10px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--gold)' }}
                    >
                      Audit Points
                    </button>
                    <button
                      onClick={() => handleOpenMatchPicks(m)}
                      style={{ padding: '10px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.4)', color: 'var(--gold)' }}
                    >
                      Manage Picks
                    </button>
                  </div>
                </div>

                {/* Inline sync log for this match */}
                {syncLog && syncLog.matchId === m.id && !syncLog.loading && (
                  <div style={{
                    marginTop: 8, background: 'rgba(255,255,255,0.02)',
                    border: `1px solid ${syncLog.status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    borderRadius: 8, padding: '12px 16px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700, color: syncLog.status === 'error' ? 'var(--red)' : 'var(--green)', marginBottom: 4 }}>
                        {syncLog.status === 'error' ? '❌ Sync Failed' : `✅ Synced — ${syncLog.synced} players`}
                      </div>
                      <button onClick={() => setSyncLog(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                    </div>
                    {syncLog.message && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--red)', marginBottom: 4 }}>{syncLog.message}</div>}
                    {syncLog.unmatched?.length > 0 && (
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--gold)', marginBottom: 4 }}>
                        <strong>Skipped (not in any squad):</strong> {syncLog.unmatched.join(', ')}
                      </div>
                    )}
                    {syncLog.status !== 'error' && (
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, marginBottom: 4,
                        color: syncLog.dotsSynced ? '#6ee7b7' : '#fca5a5' }}>
                        {syncLog.dotsSynced
                          ? `⚫ Dot balls synced for ${syncLog.dotsApplied.length} bowler(s)`
                          : '⚠️ Dot balls NOT synced — source unavailable (adjust manually if needed)'}
                      </div>
                    )}
                    {syncLog.dotsApplied?.length > 0 && (
                      <details style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Dot ball details ({syncLog.dotsApplied.length})</summary>
                        <div style={{ marginTop: 4, lineHeight: 1.8 }}>{syncLog.dotsApplied.join(' · ')}</div>
                      </details>
                    )}
                    {syncLog.matched?.length > 0 && (
                      <details style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)' }}>
                        <summary style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>Matched players ({syncLog.matched.length})</summary>
                        <div style={{ marginTop: 4, lineHeight: 1.8 }}>{syncLog.matched.join(' · ')}</div>
                      </details>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </>
  );
}
