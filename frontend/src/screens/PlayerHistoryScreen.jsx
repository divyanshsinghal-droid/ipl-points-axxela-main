import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { teamAbbr } from '../utils/iplTeams';

const BACK_LABELS = {
  leaderboard: '← Back to Leaderboard',
  team:        '← Back',
  pick:        '← Back to Squad',
};
const BACK_TARGETS = {
  leaderboard: '/leaderboard',
  team:        -1,
  pick:        '/pick',
};

const API_BASE = import.meta.env.VITE_API_URL || '';

const ROLE_LABELS = { BAT: 'BAT', BOWL: 'BOWL', BWL: 'BOWL', AR: 'AR', WK: 'WK' };

function statsSummary(stats) {
  const parts = [];
  if (stats.runs > 0) {
    const sr = stats.sr ? ` · ${stats.sr} SR` : '';
    parts.push(`${stats.runs} runs${sr}`);
  }
  if (stats.wickets > 0) {
    const eco = stats.eco ? ` · ${stats.eco} eco` : '';
    parts.push(`${stats.wickets} wkt${stats.wickets > 1 ? 's' : ''}${eco}`);
  }
  if (stats.catches > 0) {
    parts.push(`${stats.catches} catch${stats.catches > 1 ? 'es' : ''}`);
  }
  return parts.join('  ·  ') || 'No contribution';
}

function generateAnalysis(player, summary, matches) {
  const name = player.name.split(' ').pop();
  const lines = [];

  if (summary.avg_pts >= 40) {
    lines.push(`${name} has been an elite performer this season, averaging ${summary.avg_pts} pts across ${matches.length} matches.`);
  } else if (summary.avg_pts >= 20) {
    lines.push(`${name} has been a reliable contributor, averaging ${summary.avg_pts} pts per match this season.`);
  } else {
    lines.push(`${name} has had a mixed season, averaging ${summary.avg_pts} pts per match.`);
  }

  if (summary.c_times > 0) {
    const cMatches = matches.filter(m => m.is_captain);
    const cAvg = cMatches.length
      ? (cMatches.reduce((s, m) => s + m.final_pts, 0) / cMatches.length).toFixed(1)
      : 0;
    lines.push(`As Captain in ${summary.c_times} game${summary.c_times > 1 ? 's' : ''}, they returned an average of ${cAvg} pts with the 2× multiplier.`);
  }

  if (summary.vc_times > 0) {
    lines.push(`Picked as Vice Captain ${summary.vc_times} time${summary.vc_times > 1 ? 's' : ''}, contributing with the 1.5× bonus.`);
  }

  const best = matches.length ? matches.reduce((a, b) => a.base_pts > b.base_pts ? a : b, matches[0]) : null;
  if (best && best.base_pts > 0) {
    lines.push(`Best performance: ${best.base_pts} pts in ${best.match_name}.`);
  }

  return lines.join(' ');
}

export default function PlayerHistoryScreen() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const location    = useLocation();
  const fromKey     = location.state?.from || 'leaderboard';
  const backLabel   = BACK_LABELS[fromKey]  || '← Back';
  const backTarget  = BACK_TARGETS[fromKey] ?? -1;
  const [data, setData] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/players/${id}/match-history`)
      .then(r => r.json())
      .then(setData)
      .catch(console.error);
  }, [id]);

  if (!data) {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)' }}>Loading...</div>
      </div>
    );
  }

  const { player, season_summary: ss, matches } = data;
  const roleKey = ROLE_LABELS[player.role] || player.role;
  const analysis = generateAnalysis(player, ss, matches);

  const StatCard = ({ label, value, accent }) => (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, textAlign: 'center',
    }}>
      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: accent || 'var(--gold)' }}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="screen" style={{ minHeight: 'calc(100vh - 68px)', paddingBottom: 80 }}>
    <div className="container">

      {/* Back button */}
      <div style={{ paddingTop: 28, marginBottom: 28 }}>
        <button
          onClick={() => typeof backTarget === 'number' ? navigate(backTarget) : navigate(backTarget)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontFamily: "'Sora',sans-serif",
            fontSize: 13, fontWeight: 600, padding: 0,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {backLabel}
        </button>
      </div>

      {/* 2-column landscape layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 32, alignItems: 'start' }}>

        {/* ── LEFT: Player info + stats ── */}
        <div>
          {/* Player header card */}
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 28,
            display: 'flex', alignItems: 'center', gap: 20,
            marginBottom: 16,
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
              background: '#2d3748', border: '3px solid var(--gold)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 34, color: 'var(--gold)',
            }}>
              {player.name.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, lineHeight: 1,
                color: 'var(--text-primary)', letterSpacing: 1, marginBottom: 8,
              }}>
                {player.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`badge-${roleKey}`} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4 }}>
                  {roleKey}
                </span>
                <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)' }}>
                  {teamAbbr(player.ipl_team)}
                </span>
              </div>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)' }}>
                {player.fantasy_team}
              </div>
            </div>
          </div>

          {/* Stats grid — 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 10 }}>
            <StatCard label="Season Points" value={ss.total_pts} />
            <StatCard label="Avg / Match" value={ss.avg_pts} accent="var(--text-secondary)" />
            <div style={{
              background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
              borderRadius: 12, padding: 20, textAlign: 'center',
            }}>
              <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: '0.05em' }}>
                MATCHES
              </div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, lineHeight: 1, color: 'var(--text-secondary)' }}>
                {ss.total_matches ?? matches.length}
              </div>
              {ss.matches_played != null && ss.matches_played !== ss.total_matches && (
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                  played {ss.matches_played}
                </div>
              )}
            </div>
            <StatCard label="Times Captain" value={ss.c_times} />
          </div>
          {/* Times VC */}
          <div style={{
            background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 12, padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
              TIMES VICE CAPTAIN
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--purple)', lineHeight: 1 }}>
              {ss.vc_times}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Match history ── */}
        <div>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', overflow: 'hidden',
        }}>
          {/* Card header */}
          <div style={{
            padding: '18px 20px',
            borderBottom: '1px solid var(--border)',
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 18,
            color: 'var(--text-primary)', letterSpacing: '0.05em',
          }}>
            Match History &amp; Point Breakdown
          </div>

          {matches.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-muted)' }}>
              No matches played yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {matches.map((m, idx) => {
                const roleLabel = m.is_captain ? 'Captain' : m.is_vc ? 'Vice Captain' : 'Regular';
                const roleStyle = m.is_captain
                  ? { border: '1px solid var(--gold)', background: 'var(--gold-glow)', color: 'var(--gold)' }
                  : m.is_vc
                  ? { border: '1px solid rgba(139,92,246,0.4)', background: 'var(--purple-glow)', color: 'var(--purple)' }
                  : { border: '1px solid var(--border)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' };
                const multText = m.multiplier > 1 ? `(${m.base_pts} × ${m.multiplier})` : null;

                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedMatch(m)}
                    style={{
                      padding: '16px 20px',
                      borderBottom: idx < matches.length - 1 ? '1px solid var(--border)' : 'none',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 12, cursor: 'pointer', transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* Left */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "'Sora',sans-serif", fontSize: 14, fontWeight: 700,
                        color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginBottom: 4,
                      }}>
                        {m.match_name}
                      </div>
                      <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)' }}>
                        {m.date} · {statsSummary(m.stats)}
                      </div>
                    </div>

                    {/* Right */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      {/* Role badge */}
                      <div style={{
                        ...roleStyle,
                        borderRadius: 20, padding: '3px 10px',
                        fontFamily: "'Sora',sans-serif", fontSize: 11, fontWeight: 600,
                      }}>
                        {roleLabel}
                      </div>
                      {/* Points */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <div style={{
                          fontFamily: "'Bebas Neue',sans-serif", fontSize: 24,
                          color: 'var(--text-primary)', lineHeight: 1,
                        }}>
                          {m.final_pts}
                        </div>
                        {multText && (
                          <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>
                            {multText}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom sheet overlay */}
      {selectedMatch && (
        <>
          <div
            onClick={() => setSelectedMatch(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              zIndex: 200,
            }}
          />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%',
            transform: 'translateX(-50%)',
            width: '100%', maxWidth: 680,
            background: '#0d1117',
            borderRadius: '16px 16px 0 0',
            zIndex: 201,
            padding: 24, paddingBottom: 48,
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.8)',
          }}>
            {/* Handle */}
            <div style={{
              width: 40, height: 4, borderRadius: 2,
              background: 'var(--text-muted)', margin: '0 auto 20px', opacity: 0.4,
            }} />

            {/* Sheet header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
                  POINTS BREAKDOWN
                </div>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {selectedMatch.match_name}
                </div>
              </div>
              {selectedMatch.multiplier > 1 && (
                <div style={{
                  background: selectedMatch.is_captain ? 'var(--gold)' : 'var(--purple)',
                  color: '#000', borderRadius: 20, padding: '4px 12px',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 16,
                }}>
                  {selectedMatch.multiplier}× MULT
                </div>
              )}
            </div>

            {/* Base / Final cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                  BASE POINTS
                </div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {selectedMatch.base_pts}
                </div>
              </div>
              <div style={{
                background: selectedMatch.is_captain ? 'var(--gold-glow)' : selectedMatch.is_vc ? 'var(--purple-glow)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${selectedMatch.is_captain ? 'rgba(245,158,11,0.4)' : selectedMatch.is_vc ? 'rgba(139,92,246,0.4)' : 'rgba(16,185,129,0.3)'}`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ fontFamily: "'Sora',sans-serif", fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                  FINAL SCORE
                </div>
                <div style={{
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, lineHeight: 1,
                  color: selectedMatch.is_captain ? 'var(--gold)' : selectedMatch.is_vc ? 'var(--purple)' : 'var(--green)',
                }}>
                  {selectedMatch.final_pts}
                </div>
              </div>
            </div>

            {/* Breakdown sections */}
            {Object.entries(selectedMatch.breakdown).map(([section, items]) => (
              <div key={section} style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
                borderRadius: 10, overflow: 'hidden', marginBottom: 10,
              }}>
                <div style={{
                  padding: '8px 14px',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: "'Bebas Neue',sans-serif", fontSize: 13,
                  color: 'var(--text-muted)', letterSpacing: '0.08em',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  {section}
                </div>
                {Object.entries(items).map(([label, pts]) => {
                  const isNeg = String(pts).startsWith('-');
                  const isZero = pts === '0' || pts === 0;
                  const ptColor = isNeg ? 'var(--red)' : isZero ? 'var(--text-muted)' : 'var(--green)';
                  return (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.03)',
                    }}>
                      <span style={{ fontFamily: "'Sora',sans-serif", fontSize: 13, color: 'var(--text-secondary)' }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: ptColor }}>
                        {pts}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Expert Analysis box */}
            {analysis && (
              <div style={{
                background: 'rgba(245,158,11,0.05)',
                borderLeft: '4px solid var(--gold)',
                borderRadius: '0 12px 12px 0',
                padding: 20, marginTop: 16,
              }}>
                <div style={{
                  fontFamily: "'Sora',sans-serif", fontSize: 12, fontWeight: 700,
                  color: 'var(--gold)', letterSpacing: '0.08em', marginBottom: 8,
                }}>
                  ANALYSIS
                </div>
                <div style={{
                  fontFamily: "'Sora',sans-serif", fontSize: 13,
                  color: 'var(--text-muted)', lineHeight: 1.6,
                }}>
                  {analysis}
                </div>
              </div>
            )}
          </div>
        </>
      )}

    </div>
    </div>
    </div>
  );
}
