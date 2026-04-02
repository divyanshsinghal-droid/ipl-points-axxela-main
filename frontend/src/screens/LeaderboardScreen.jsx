import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { teamAbbr } from '../utils/iplTeams';

const API_BASE = import.meta.env.VITE_API_URL || '';


const PODIUM_CONFIGS = [
  { slot: 1, height: 90,  color: '#94a3b8', gradient: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.3)', avatarSize: 68, fontSize: 28 },
  { slot: 0, height: 120, color: '#f59e0b', gradient: 'rgba(245,158,11,0.15)',  borderColor: 'rgba(245,158,11,0.5)',  avatarSize: 80, fontSize: 36 },
  { slot: 2, height: 70,  color: '#b45309', gradient: 'rgba(180,83,9,0.08)',    borderColor: 'rgba(180,83,9,0.3)',    avatarSize: 60, fontSize: 24 },
];

export default function LeaderboardScreen() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('teams');
  const [teams, setTeams]           = useState([]);
  const [players, setPlayers]       = useState([]);
  const [matches, setMatches]       = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null); // null = All Season
  const [matchTeams, setMatchTeams]   = useState([]);
  const [matchPlayers, setMatchPlayers] = useState([]);
  const [loading, setLoading]         = useState(true);

  // Fetch completed matches for filter pills
  useEffect(() => {
    fetch(`${API_BASE}/matches`)
      .then(r => r.json())
      .then(data => {
        const completed = Array.isArray(data)
          ? data.filter(m => m.is_completed)
          : [];
        setMatches(completed);
      })
      .catch(() => {});
  }, []);

  // Fetch all-season teams
  useEffect(() => {
    if (activeTab !== 'teams') return;
    setLoading(true);
    fetch(`${API_BASE}/leaderboard/teams`)
      .then(r => r.json())
      .then(setTeams)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  // Fetch per-match data when a match is selected
  useEffect(() => {
    if (!selectedMatch) { setMatchTeams([]); setMatchPlayers([]); return; }
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/leaderboard/match/${selectedMatch}`).then(r => r.json()),
      fetch(`${API_BASE}/leaderboard/match/${selectedMatch}/players`).then(r => r.json()),
    ])
      .then(([teamsData, playersData]) => {
        setMatchTeams(Array.isArray(teamsData) ? teamsData : []);
        setMatchPlayers(Array.isArray(playersData) ? playersData : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedMatch]);

  // Fetch players (season totals)
  useEffect(() => {
    if (activeTab !== 'players') return;
    setLoading(true);
    fetch(`${API_BASE}/leaderboard/players`)
      .then(r => r.json())
      .then(data => setPlayers(Array.isArray(data) ? data.slice(0, 80) : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeTab]);

  const tabs = [
    { key: 'teams',   label: '🏆 Teams' },
    { key: 'players', label: '👤 All Players' },
  ];

  return (
    <div className="screen" style={{ minHeight: 'calc(100vh - 68px)', paddingBottom: 80 }}>
    <div className="container">

      {/* ── PAGE HEADER ── */}
      <div style={{ paddingTop: 40 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Global Standings</div>
        <div style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 56, letterSpacing: 2, lineHeight: 1,
          color: 'var(--text-primary)', marginBottom: 24,
        }}>
          LEADERBOARD
        </div>

        {/* Tab row */}
        <div style={{
          display: 'flex', gap: 24,
          borderBottom: '1px solid var(--border)',
          marginBottom: 0,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: 14,
                color: activeTab === t.key ? 'var(--gold)' : 'var(--text-muted)',
                borderBottom: activeTab === t.key ? '2px solid var(--gold)' : '2px solid transparent',
                paddingBottom: 12, paddingLeft: 0, paddingRight: 0,
                transition: 'var(--transition)', marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── MATCH FILTER PILLS ── */}
      {matches.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          padding: '16px 0 0',
          scrollbarWidth: 'none',
        }}>
          <FilterPill
            label="All Season"
            active={selectedMatch === null}
            onClick={() => setSelectedMatch(null)}
          />
          {matches.map((m, i) => (
            <FilterPill
              key={m.id}
              label={`M${i + 1}: ${shortTeam(m.team1)} v ${shortTeam(m.team2)}`}
              active={selectedMatch === m.id}
              onClick={() => setSelectedMatch(m.id)}
            />
          ))}
        </div>
      )}

      <div style={{ paddingTop: 24 }}>

        {/* ══════════ TEAMS TAB ══════════ */}
        {activeTab === 'teams' && (
          <>
            {loading ? (
              <LoadingState />
            ) : teams.length === 0 ? (
              <EmptyState text="No team data yet." />
            ) : (
              <>
                {/* PODIUM — only on All Season view */}
                {!selectedMatch && teams.length >= 3 && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-end',
                    justifyContent: 'center', gap: 24,
                    margin: '40px 0',
                  }}>
                    {PODIUM_CONFIGS.map(cfg => {
                      const team = teams[cfg.slot];
                      if (!team) return null;
                      const rankLabel = cfg.slot === 0 ? '1' : cfg.slot === 1 ? '2' : '3';
                      return (
                        <div
                          key={cfg.slot}
                          style={{
                            width: 140, display: 'flex', flexDirection: 'column',
                            alignItems: 'center',
                            position: 'relative',
                          }}
                        >
                          {/* Avatar */}
                          <div style={{
                            width: cfg.avatarSize, height: cfg.avatarSize,
                            borderRadius: '50%',
                            background: team.color_hex || 'var(--gold)',
                            border: `4px solid var(--bg)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'Bebas Neue',sans-serif",
                            fontSize: cfg.fontSize, color: '#000',
                            boxShadow: `0 0 20px ${cfg.color}40`,
                            zIndex: 2, position: 'relative',
                          }}>
                            {team.team_code?.charAt(0) || team.name?.charAt(0)}
                          </div>

                          {/* Team name */}
                          <div style={{
                            fontFamily: "'Sora',sans-serif",
                            fontSize: 11, fontWeight: 600,
                            color: cfg.slot === 0 ? 'var(--gold)' : 'var(--text-secondary)',
                            textAlign: 'center', marginTop: 8, marginBottom: 6,
                            maxWidth: 130, lineHeight: 1.3,
                          }}>
                            {team.name}
                          </div>

                          {/* Points */}
                          <div style={{
                            fontFamily: "'Bebas Neue',sans-serif",
                            fontSize: cfg.slot === 0 ? 26 : 20,
                            color: cfg.color, lineHeight: 1, marginBottom: 8,
                          }}>
                            {team.total_pts}
                          </div>

                          {/* Podium base */}
                          <div style={{
                            width: '100%', height: cfg.height, borderRadius: '10px 10px 0 0',
                            background: `linear-gradient(to bottom, ${cfg.gradient}, transparent)`,
                            border: `1px solid ${cfg.borderColor}`,
                            borderBottom: 'none',
                            display: 'flex', alignItems: 'flex-end',
                            justifyContent: 'center', paddingBottom: 10,
                            position: 'relative', overflow: 'hidden',
                          }}>
                            {/* Rank watermark */}
                            <div style={{
                              position: 'absolute', bottom: 4,
                              fontFamily: "'Bebas Neue',sans-serif",
                              fontSize: 48, color: 'rgba(255,255,255,0.06)',
                              lineHeight: 1, userSelect: 'none',
                            }}>
                              {rankLabel}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* FULL RANKINGS TABLE */}
                <div className="card" style={{ overflow: 'hidden', marginTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Team</th>
                        <th style={thStyle}>Base</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>
                          {selectedMatch ? 'With C/VC' : 'Total'}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedMatch ? matchTeams : teams).map(team => (
                        <tr
                          key={team.id}
                          onClick={() => navigate(`/team/${team.id}`, { state: { from: 'leaderboard' } })}
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'var(--card-hover)')}
                          onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
                        >
                          <td style={{ ...tdStyle, width: 40, textAlign: 'center' }}>
                            <RankBadge rank={team.rank} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                background: team.color_hex || 'var(--gold)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#000',
                              }}>
                                {team.team_code?.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{team.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{team.owner_name}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--text-muted)' }}>
                              {team.base_pts}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <span className="points-value" style={{
                              fontFamily: "'Bebas Neue',sans-serif", fontSize: 28,
                              color: team.rank === 1 ? 'var(--gold)' : 'var(--text-primary)',
                            }}>
                              {team.total_pts}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ══════════ PLAYERS TAB ══════════ */}
        {activeTab === 'players' && (
          <>
            {loading ? (
              <LoadingState />
            ) : (selectedMatch ? matchPlayers : players).length === 0 ? (
              <EmptyState text="No player data yet." />
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Player</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>
                        {selectedMatch ? 'Match Pts' : 'Season'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedMatch ? matchPlayers : players).map(p => (
                      <tr
                        key={p.id}
                        onClick={() => navigate(`/player/${p.id}`, { state: { from: 'leaderboard' } })}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = 'var(--card-hover)')}
                        onMouseLeave={e => e.currentTarget.querySelectorAll('td').forEach(td => td.style.background = '')}
                      >
                        <td style={{ ...tdStyle, width: 40, textAlign: 'center' }}>
                          <RankBadge rank={p.rank} />
                        </td>
                        <td style={tdStyle}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                            <RoleBadge role={p.role} />
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {teamAbbr(p.ipl_team)} · {p.fantasy_team}
                          </div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--text-primary)' }}>
                            {p.total_pts}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </div>
    </div>
  );
}

/* ── Sub-components ── */

function FilterPill({ label, active = false, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'Sora',sans-serif", fontWeight: 600, fontSize: 11,
        whiteSpace: 'nowrap', border: 'none', borderRadius: 20,
        padding: '5px 12px', cursor: 'pointer', transition: 'var(--transition)',
        background: active ? 'var(--gold-glow)' : 'var(--card)',
        color: active ? 'var(--gold)' : 'var(--text-muted)',
        outline: `1px solid ${active ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
      }}
    >
      {label}
    </button>
  );
}

function RankBadge({ rank }) {
  const color = rank === 1 ? 'var(--gold)'
              : rank === 2 ? '#94a3b8'
              : rank === 3 ? '#b45309'
              : 'var(--text-muted)';
  return (
    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color }}>
      {rank}
    </span>
  );
}

function RoleBadge({ role }) {
  const map = {
    BAT:  { bg: '#1e3a8a', text: '#93c5fd' },
    BOWL: { bg: '#064e3b', text: '#6ee7b7' },
    AR:   { bg: '#4c1d95', text: '#c4b5fd' },
    WK:   { bg: '#78350f', text: '#fcd34d' },
  };
  const s = map[role] || map.BAT;
  return (
    <span style={{
      background: s.bg, color: s.text,
      fontSize: 9, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.5px',
    }}>
      {role === 'BOWL' ? 'BWL' : role}
    </span>
  );
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '14px 16px',
        }}>
          <div className="skeleton skeleton-circle" style={{ width: 36, height: 36, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="skeleton skeleton-text" style={{ width: `${55 + (i % 3) * 15}%` }} />
            <div className="skeleton skeleton-text" style={{ width: '40%', height: 10 }} />
          </div>
          <div className="skeleton" style={{ width: 40, height: 28, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">📊</div>
      <div className="empty-state-text">{text}</div>
    </div>
  );
}

function shortTeam(name = '') {
  const abbr = { 'Mumbai Indians': 'MI', 'Chennai Super Kings': 'CSK',
    'Royal Challengers Bengaluru': 'RCB', 'Royal Challengers Bangalore': 'RCB',
    'Kolkata Knight Riders': 'KKR', 'Sunrisers Hyderabad': 'SRH',
    'Delhi Capitals': 'DC', 'Rajasthan Royals': 'RR',
    'Punjab Kings': 'PBKS', 'Lucknow Super Giants': 'LSG',
    'Gujarat Titans': 'GT', 'Mumbai Indians': 'MI' };
  return abbr[name] || name.split(' ').map(w => w[0]).join('').slice(0, 3);
}

/* ── Table styles ── */
const thStyle = {
  padding: '14px 16px',
  fontFamily: "'Sora',sans-serif",
  fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '1.5px',
  color: 'var(--text-muted)',
  background: 'rgba(255,255,255,0.02)',
  textAlign: 'center',
};

const tdStyle = {
  padding: '16px',
  borderBottom: '1px solid var(--border)',
  fontSize: 14,
};
