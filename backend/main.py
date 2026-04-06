import os, datetime, asyncio, json
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from database import engine, Base, get_db
import models, schemas, auth, cricket_sync
from seed_real_teams import run_seed as seed_real_teams

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from database import SessionLocal
    db = SessionLocal()
    try:
        team_count = db.query(models.Team).count()
        if team_count == 0:
            print("No teams found — auto-seeding real teams and players...")
            seed_real_teams()
            print("Auto-seed complete!")
    except Exception as e:
        print(f"Auto-seed error: {e}")
    finally:
        db.close()

    task = asyncio.create_task(cricket_sync.automated_sync_loop())
    yield
    task.cancel()


app = FastAPI(title="IPL Fantasy 2026", lifespan=lifespan)

# CORS: allow specific origins only — cannot use wildcard with credentials
_raw_origins = os.getenv("FRONTEND_URL", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}


# ─── HELPERS ────────────────────────────────────────────────────────────────

def _serialize_match(m: models.Match) -> dict:
    return {
        "id": m.id,
        "ipl_match_id": m.ipl_match_id,
        "team1": m.team1,
        "team2": m.team2,
        "match_date": m.match_date.isoformat() + "Z",
        "deadline": m.deadline.isoformat() + "Z",
        "is_completed": m.is_completed,
        "cricket_live_match_id": m.cricket_live_match_id,
    }


def _categorize_breakdown(bd: dict) -> dict:
    """Convert flat scoring breakdown dict into categorized sections for the frontend."""
    result = {}

    if bd.get("playing_xi"):
        result["PLAYING XI"] = {"Named in XI": f"+{bd['playing_xi']}"}

    bat = {}
    if bd.get("runs"): bat["Runs"] = f"+{bd['runs']}"
    if bd.get("fours_bonus"): bat["Four Bonus"] = f"+{bd['fours_bonus']}"
    if bd.get("sixes_bonus"): bat["Six Bonus"] = f"+{bd['sixes_bonus']}"
    if bd.get("milestone"): bat["Milestone"] = f"+{bd['milestone']}"
    if "duck" in bd: bat["Duck"] = str(bd["duck"])
    if bat:
        result["BATTING"] = bat

    sr = {}
    if "strike_rate_bonus" in bd:
        v = bd["strike_rate_bonus"]
        sr["SR Bonus"] = f"+{v}" if v >= 0 else str(v)
        if "strike_rate_val" in bd: sr["SR Value"] = str(bd["strike_rate_val"])
    if sr:
        result["STRIKE RATE"] = sr

    bowl = {}
    if bd.get("wickets"): bowl["Wickets"] = f"+{bd['wickets']}"
    if bd.get("lbw_bowled_bonus"): bowl["LBW / Bowled Bonus"] = f"+{bd['lbw_bowled_bonus']}"
    if bd.get("maidens"): bowl["Maidens"] = f"+{bd['maidens']}"
    if bd.get("dots"): bowl["Dot Balls"] = f"+{bd['dots']}"
    if bd.get("wicket_haul_bonus"): bowl["Wicket Haul Bonus"] = f"+{bd['wicket_haul_bonus']}"
    if bowl:
        result["BOWLING"] = bowl

    eco = {}
    if "economy_bonus" in bd:
        v = bd["economy_bonus"]
        eco["Economy Bonus"] = f"+{v}" if v >= 0 else str(v)
        if "economy_val" in bd: eco["Economy Rate"] = str(bd["economy_val"])
    if eco:
        result["ECONOMY"] = eco

    field = {}
    if bd.get("catches"): field["Catches"] = f"+{bd['catches']}"
    if bd.get("three_catch_bonus"): field["3-Catch Bonus"] = f"+{bd['three_catch_bonus']}"
    if bd.get("run_outs"): field["Run Outs"] = f"+{bd['run_outs']}"
    if bd.get("stumpings"): field["Stumpings"] = f"+{bd['stumpings']}"
    if field:
        result["FIELDING"] = field

    return result


def _compute_team_pts_for_match(db: Session, team_id: int, match_id: int,
                                 team_player_ids: list, pick) -> float:
    """Compute fantasy points for a team for a specific match, applying captain multipliers."""
    total = 0.0
    for p_id in team_player_ids:
        score = db.query(models.MatchScore).filter_by(player_id=p_id, match_id=match_id).first()
        if score:
            pts = score.fantasy_points_final if score.fantasy_points_final else score.fantasy_points_base
            if pick:
                if pick.captain_player_id == p_id:
                    pts *= 2.0
                elif pick.vc_player_id == p_id:
                    pts *= 1.5
            total += pts
    return total


# ─── AUTH ───────────────────────────────────────────────────────────────────

@app.post("/auth/team-login", response_model=schemas.Token)
def login_team(login_data: schemas.TeamLogin, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.team_code == login_data.team_code).first()
    if not team:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    env_password = os.getenv(team.password_env_key)
    if not env_password:
        raise HTTPException(status_code=500, detail="Server configuration error")
    if not auth.verify_password(login_data.password, env_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth.create_access_token(data={"sub": str(team.id), "team_code": team.team_code, "role": "team"})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/auth/admin-login", response_model=schemas.Token)
def login_admin(login_data: schemas.AdminLogin):
    admin_pass = os.getenv("ADMIN_PASSWORD")
    if not admin_pass or not auth.verify_password(login_data.password, admin_pass):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = auth.create_access_token(data={"sub": "admin", "role": "admin"})
    return {"access_token": token, "token_type": "bearer"}


# ─── TEAMS ──────────────────────────────────────────────────────────────────

@app.get("/teams", response_model=List[schemas.TeamResponse])
def get_teams(db: Session = Depends(get_db)):
    return db.query(models.Team).order_by(models.Team.id).all()


@app.get("/teams/{team_id}/squad", response_model=List[schemas.PlayerResponse])
def get_team_squad(team_id: int, db: Session = Depends(get_db),
                   current_team: dict = Depends(auth.get_current_team)):
    # Enforce squad isolation: a team can only see their own squad
    if current_team["team_id"] != team_id:
        raise HTTPException(status_code=403, detail="Access denied")

    players = db.query(models.Player).filter(models.Player.team_id == team_id).all()
    res = []
    for p in players:
        scores = (db.query(models.MatchScore)
                  .filter_by(player_id=p.id)
                  .order_by(models.MatchScore.id.desc())
                  .limit(8).all())
        last_8 = [round((s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base), 1) for s in reversed(scores)]
        while len(last_8) < 8:
            last_8.insert(0, 0)
        scored_matches = [x for x in last_8 if x > 0]
        avg_pts = round(sum(scored_matches) / max(len(scored_matches), 1), 1) if scored_matches else 0.0

        role_str = p.role.value if hasattr(p.role, "value") else str(p.role)
        role_str = role_str.split(".")[-1]

        res.append({
            "id": p.id, "name": p.name, "team_id": p.team_id, "ipl_team": p.ipl_team,
            "role": role_str, "cricketdata_player_id": p.cricketdata_player_id,
            "last_8_scores": last_8, "avg_pts": avg_pts,
        })
    return res


# ─── PUBLIC TEAM DETAIL ENDPOINTS ───────────────────────────────────────────

@app.get("/teams/{team_id}/public-squad")
def get_team_public_squad(team_id: int, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    completed_matches = (db.query(models.Match)
                         .filter(models.Match.is_completed == True)
                         .all())
    team_player_ids = [p.id for p in team.players]
    team_total = 0.0
    for m in completed_matches:
        pick = (db.query(models.CaptainPick)
                .filter_by(fantasy_team_id=team_id, match_id=m.id, is_locked=True)
                .first())
        team_total += _compute_team_pts_for_match(db, team_id, m.id, team_player_ids, pick)

    players = []
    for p in team.players:
        scores = db.query(models.MatchScore).filter_by(player_id=p.id).all()
        total_pts = sum((s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base) for s in scores)
        role_str = p.role.value if hasattr(p.role, "value") else str(p.role)
        role_str = role_str.split(".")[-1]
        players.append({
            "id": p.id, "name": p.name, "role": role_str,
            "ipl_team": p.ipl_team, "total_pts": round(total_pts, 1),
        })

    players.sort(key=lambda x: x["total_pts"], reverse=True)

    return {
        "team": {
            "id": team.id, "name": team.name, "team_code": team.team_code,
            "owner_name": team.owner_name, "color_hex": team.color_hex,
            "total_pts": round(team_total, 1),
            "matches_played": len(completed_matches),
        },
        "players": players,
    }


@app.get("/teams/{team_id}/captaincy-history")
def get_team_captaincy_history(team_id: int, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter(models.Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    team_player_ids = [p.id for p in team.players]
    picks = (db.query(models.CaptainPick)
             .filter_by(fantasy_team_id=team_id, is_locked=True)
             .all())

    res = []
    for pick in picks:
        match = db.query(models.Match).filter_by(id=pick.match_id).first()
        if not match or not match.is_completed:
            continue
        c_player = db.query(models.Player).filter_by(id=pick.captain_player_id).first()
        vc_player = db.query(models.Player).filter_by(id=pick.vc_player_id).first()
        team_pts = _compute_team_pts_for_match(db, team_id, match.id, team_player_ids, pick)
        base_pts = _compute_team_pts_for_match(db, team_id, match.id, team_player_ids, None)
        res.append({
            "match_id": match.id,
            "match_name": f"{match.team1} v {match.team2}",
            "match_date": match.match_date.strftime("%d %b %Y"),
            "captain_name": c_player.name if c_player else "Unknown",
            "vc_name": vc_player.name if vc_player else "Unknown",
            "base_pts": round(base_pts, 1),
            "team_pts": round(team_pts, 1),
        })

    res.sort(key=lambda x: x["match_id"])
    return res


@app.get("/teams/{team_id}/match/{match_id}/scores")
def get_team_match_scores(team_id: int, match_id: int, db: Session = Depends(get_db)):
    team = db.query(models.Team).filter_by(id=team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    pick = (db.query(models.CaptainPick)
            .filter_by(fantasy_team_id=team_id, match_id=match_id, is_locked=True)
            .first())
    res = []
    for player in team.players:
        score = db.query(models.MatchScore).filter_by(player_id=player.id, match_id=match_id).first()
        if not score:
            continue
        pts = score.fantasy_points_final if score.fantasy_points_final else score.fantasy_points_base
        multiplier = 1.0
        if pick:
            if pick.captain_player_id == player.id:
                multiplier = 2.0
            elif pick.vc_player_id == player.id:
                multiplier = 1.5
        role_str = player.role.value if hasattr(player.role, "value") else str(player.role)
        res.append({
            "player_id": player.id,
            "player_name": player.name,
            "role": role_str.split(".")[-1],
            "base_pts": round(pts, 1),
            "multiplier": multiplier,
            "final_pts": round(pts * multiplier, 1),
            "is_captain": pick and pick.captain_player_id == player.id,
            "is_vc": pick and pick.vc_player_id == player.id,
        })
    res.sort(key=lambda x: x["final_pts"], reverse=True)
    return res


# ─── MATCHES ────────────────────────────────────────────────────────────────

@app.get("/matches")
def list_all_matches(db: Session = Depends(get_db)):
    matches = db.query(models.Match).order_by(models.Match.match_date).all()
    return [_serialize_match(m) for m in matches]


@app.get("/matches/current", response_model=schemas.MatchResponse)
@app.get("/matches/upcoming", response_model=schemas.MatchResponse)
def get_current_match(db: Session = Depends(get_db)):
    match = (db.query(models.Match)
             .filter(models.Match.is_completed == False)
             .order_by(models.Match.deadline)
             .first())
    if not match:
        raise HTTPException(status_code=404, detail="No upcoming matches scheduled")
    return _serialize_match(match)


@app.get("/matches/upcoming-all")
def get_all_upcoming_matches(db: Session = Depends(get_db)):
    matches = (db.query(models.Match)
               .filter(models.Match.is_completed == False)
               .order_by(models.Match.deadline)
               .all())
    return [_serialize_match(m) for m in matches]


# ─── PICKS ──────────────────────────────────────────────────────────────────

@app.post("/picks/submit")
def submit_picks(pick: schemas.PickSubmit, db: Session = Depends(get_db),
                 current_team: dict = Depends(auth.get_current_team)):
    if pick.captain_player_id == pick.vc_player_id:
        raise HTTPException(status_code=400, detail="Captain and Vice Captain must be different players")

    team_id = current_team["team_id"]

    # Validate both players belong to this team's squad
    captain = db.query(models.Player).filter_by(id=pick.captain_player_id, team_id=team_id).first()
    vc = db.query(models.Player).filter_by(id=pick.vc_player_id, team_id=team_id).first()
    if not captain or not vc:
        raise HTTPException(status_code=400, detail="Players must be from your own squad")

    match = db.query(models.Match).filter(models.Match.id == pick.match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    if datetime.datetime.utcnow() > match.deadline:
        raise HTTPException(status_code=400, detail="Deadline has passed — picks are locked")

    existing = (db.query(models.CaptainPick)
                .filter_by(match_id=pick.match_id, fantasy_team_id=team_id)
                .first())
    if existing:
        existing.captain_player_id = pick.captain_player_id
        existing.vc_player_id = pick.vc_player_id
        existing.submitted_at = datetime.datetime.utcnow()
        existing.is_locked = True
    else:
        new_pick = models.CaptainPick(
            fantasy_team_id=team_id,
            match_id=pick.match_id,
            captain_player_id=pick.captain_player_id,
            vc_player_id=pick.vc_player_id,
            is_locked=True,
        )
        db.add(new_pick)
    db.commit()
    return {"status": "success"}


@app.get("/picks/history")
def get_pick_history(db: Session = Depends(get_db),
                     current_team: dict = Depends(auth.get_current_team)):
    picks = (db.query(models.CaptainPick)
             .filter_by(fantasy_team_id=current_team["team_id"], is_locked=True)
             .all())
    res = []
    for p in picks:
        match = db.query(models.Match).filter_by(id=p.match_id).first()
        c_player = db.query(models.Player).filter_by(id=p.captain_player_id).first()
        vc_player = db.query(models.Player).filter_by(id=p.vc_player_id).first()

        def role_str(pl):
            if not pl: return ""
            r = pl.role.value if hasattr(pl.role, "value") else str(pl.role)
            return r.split(".")[-1]

        res.append({
            "id": p.id,
            "match_id": p.match_id,
            "match_name": f"{match.team1} v {match.team2}" if match else "Unknown",
            "match_date": match.match_date.strftime("%d %b %Y") if match else "",
            "is_completed": match.is_completed if match else False,
            "captain_player_id": p.captain_player_id,
            "captain_name": c_player.name if c_player else "Unknown",
            "captain_role": role_str(c_player),
            "vc_player_id": p.vc_player_id,
            "vc_name": vc_player.name if vc_player else "Unknown",
            "vc_role": role_str(vc_player),
            "is_locked": p.is_locked,
            "submitted_at": p.submitted_at.isoformat() if p.submitted_at else "",
        })
    return res


# ─── LEADERBOARD ─────────────────────────────────────────────────────────────

@app.get("/leaderboard/teams", response_model=List[schemas.LeaderboardTeamResponse])
def get_leaderboard_teams(db: Session = Depends(get_db)):
    teams = db.query(models.Team).all()
    completed_matches = (db.query(models.Match)
                         .filter(models.Match.is_completed == True)
                         .order_by(models.Match.match_date)
                         .all())
    match_ids = [m.id for m in completed_matches]

    # Bulk fetch all scores and picks — avoids N+1 queries
    all_scores = db.query(models.MatchScore).filter(
        models.MatchScore.match_id.in_(match_ids)
    ).all() if match_ids else []
    score_map = {(s.player_id, s.match_id): s for s in all_scores}

    all_picks = db.query(models.CaptainPick).filter(
        models.CaptainPick.match_id.in_(match_ids),
        models.CaptainPick.is_locked == True
    ).all() if match_ids else []
    pick_map = {(p.fantasy_team_id, p.match_id): p for p in all_picks}

    res = []
    for t in teams:
        team_player_ids = [p.id for p in t.players]
        total_pts = 0.0
        base_pts = 0.0
        recent_form = []

        for m in completed_matches:
            pick = pick_map.get((t.id, m.id))
            match_pts = 0.0
            match_base = 0.0
            for p_id in team_player_ids:
                s = score_map.get((p_id, m.id))
                if s:
                    pts = s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base
                    match_base += pts
                    if pick:
                        if pick.captain_player_id == p_id:
                            pts *= 2.0
                        elif pick.vc_player_id == p_id:
                            pts *= 1.5
                    match_pts += pts
            total_pts += match_pts
            base_pts += match_base
            recent_form.append(round(match_pts, 1))

        recent_form = recent_form[-8:]
        while len(recent_form) < 8:
            recent_form.insert(0, 0)

        avg_pts = round(total_pts / max(len(completed_matches), 1), 1)
        res.append({
            "rank": 0, "id": t.id, "team_code": t.team_code, "name": t.name,
            "owner_name": t.owner_name, "total_pts": round(total_pts, 1),
            "base_pts": round(base_pts, 1),
            "avg_pts": avg_pts,
            "matches_count": len(completed_matches),
            "color_hex": t.color_hex, "recent_form": recent_form,
        })

    res.sort(key=lambda x: x["total_pts"], reverse=True)
    for i, t in enumerate(res):
        t["rank"] = i + 1
    return res


@app.get("/leaderboard/match/{match_id}")
def get_match_leaderboard(match_id: int, db: Session = Depends(get_db)):
    match = db.query(models.Match).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    teams = db.query(models.Team).all()
    res = []
    for t in teams:
        team_player_ids = [p.id for p in t.players]
        pick = (db.query(models.CaptainPick)
                .filter_by(fantasy_team_id=t.id, match_id=match_id, is_locked=True)
                .first())
        total_pts = _compute_team_pts_for_match(db, t.id, match_id, team_player_ids, pick)
        base_pts = _compute_team_pts_for_match(db, t.id, match_id, team_player_ids, None)
        res.append({
            "id": t.id, "name": t.name, "team_code": t.team_code,
            "owner_name": t.owner_name, "color_hex": t.color_hex,
            "base_pts": round(base_pts, 1),
            "total_pts": round(total_pts, 1),
            "rank": 0,
        })
    res.sort(key=lambda x: x["total_pts"], reverse=True)
    for i, t in enumerate(res):
        t["rank"] = i + 1
    return res


@app.get("/leaderboard/match/{match_id}/players")
def get_match_leaderboard_players(match_id: int, db: Session = Depends(get_db)):
    match = db.query(models.Match).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    from sqlalchemy.orm import joinedload
    scores = (db.query(models.MatchScore)
              .filter_by(match_id=match_id)
              .join(models.Player, models.MatchScore.player_id == models.Player.id)
              .options(joinedload(models.MatchScore.player).joinedload(models.Player.team))
              .all())
    res = []
    for s in scores:
        player = s.player
        if not player:
            continue
        role_str = player.role.value if hasattr(player.role, "value") else str(player.role)
        pts = s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base
        res.append({
            "rank": 0, "id": player.id, "name": player.name,
            "role": role_str.split(".")[-1], "ipl_team": player.ipl_team,
            "fantasy_team": player.team.name if player.team else "Unsold",
            "total_pts": round(pts, 1),
            "avg_pts": round(pts, 1),
            "runs": s.runs, "wickets": s.wickets,
            "c_multiplier_count": 0, "vc_multiplier_count": 0,
            "sparkline": [0]*8, "highest_score": round(pts, 1),
        })
    res.sort(key=lambda x: x["total_pts"], reverse=True)
    for i, p in enumerate(res):
        p["rank"] = i + 1
    return res


@app.get("/leaderboard/players", response_model=List[schemas.LeaderboardPlayerResponse])
def get_leaderboard_players(role: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Player).join(models.Team)
    if role:
        if role == "BATSMEN":
            query = query.filter(models.Player.role.in_([models.RoleEnum.BAT, models.RoleEnum.WK]))
        elif role == "BOWLERS":
            query = query.filter(models.Player.role == models.RoleEnum.BOWL)
        else:
            try:
                query = query.filter(models.Player.role == models.RoleEnum[role])
            except KeyError:
                pass

    players = query.all()
    player_ids = [p.id for p in players]

    # Bulk fetch all scores and captain pick counts
    all_scores = db.query(models.MatchScore).filter(
        models.MatchScore.player_id.in_(player_ids)
    ).order_by(models.MatchScore.match_id).all() if player_ids else []

    from collections import defaultdict
    scores_by_player = defaultdict(list)
    for s in all_scores:
        scores_by_player[s.player_id].append(s)

    all_picks = db.query(models.CaptainPick).filter(
        models.CaptainPick.is_locked == True
    ).all()
    c_count = defaultdict(int)
    vc_count = defaultdict(int)
    for cp in all_picks:
        if cp.captain_player_id:
            c_count[cp.captain_player_id] += 1
        if cp.vc_player_id:
            vc_count[cp.vc_player_id] += 1

    res = []
    for p in players:
        scores = scores_by_player[p.id]
        total_pts = sum((s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base) for s in scores)
        runs = sum(s.runs for s in scores)
        wickets = sum(s.wickets for s in scores)
        highest_score = max([(s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base) for s in scores] + [0])
        sparkline = [(s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base) for s in scores][-8:]
        while len(sparkline) < 8:
            sparkline.insert(0, 0)

        role_str = p.role.value if hasattr(p.role, "value") else str(p.role)
        res.append({
            "rank": 0, "id": p.id, "name": p.name,
            "role": role_str.split(".")[-1], "ipl_team": p.ipl_team,
            "fantasy_team": p.team.name if p.team else "Unsold",
            "runs": runs, "wickets": wickets,
            "c_multiplier_count": c_count[p.id], "vc_multiplier_count": vc_count[p.id],
            "total_pts": round(total_pts, 1),
            "avg_pts": round(total_pts / max(len(scores), 1), 1),
            "sparkline": sparkline, "highest_score": highest_score,
        })

    res.sort(key=lambda x: x["total_pts"], reverse=True)
    for i, p in enumerate(res):
        p["rank"] = i + 1
    return res


# ─── PLAYER HISTORY ──────────────────────────────────────────────────────────

@app.get("/players/{player_id}/match-history")
def get_player_history(player_id: int, db: Session = Depends(get_db)):
    player = db.query(models.Player).filter(models.Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")

    scores = (db.query(models.MatchScore)
              .filter_by(player_id=player_id)
              .join(models.Match)
              .order_by(models.Match.match_date)
              .all())

    c_times = db.query(models.CaptainPick).filter_by(captain_player_id=player_id).count()
    vc_times = db.query(models.CaptainPick).filter_by(vc_player_id=player_id).count()
    total_base = sum((s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base) for s in scores)
    total_completed_matches = db.query(models.Match).filter_by(is_completed=True).count()

    matches_arr = []
    for s in scores:
        is_c = db.query(models.CaptainPick).filter_by(match_id=s.match_id, captain_player_id=player_id).first() is not None
        is_vc = (not is_c) and db.query(models.CaptainPick).filter_by(match_id=s.match_id, vc_player_id=player_id).first() is not None
        mult = 2.0 if is_c else 1.5 if is_vc else 1.0
        base = s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base
        final_pts = round(base * mult, 1)

        try:
            st = json.loads(s.stats_json)
        except Exception:
            st = {"runs": s.runs, "sr": 0, "wickets": s.wickets, "eco": 0, "catches": s.catches}

        try:
            flat_bd = json.loads(s.breakdown_json)
        except Exception:
            flat_bd = {}

        categorized_bd = _categorize_breakdown(flat_bd)

        # Compute batting/bowling/fielding proportions from breakdown
        bat_t = flat_bd.get("batting_total", 0)
        bowl_t = flat_bd.get("bowling_total", 0)
        field_t = flat_bd.get("fielding_total", 0) + flat_bd.get("playing_xi", 0)
        total_t = max(bat_t + bowl_t + field_t, 1)
        proportions = {
            "bat": round((max(bat_t, 0) / total_t) * 100),
            "bowl": round((max(bowl_t, 0) / total_t) * 100),
            "field": round((max(field_t, 0) / total_t) * 100),
        }

        matches_arr.append({
            "id": s.match.id,
            "match_name": f"{s.match.team1} v {s.match.team2}",
            "date": s.match.match_date.strftime("%d %b %Y"),
            "result": "Completed",
            "is_captain": is_c, "is_vc": is_vc, "multiplier": mult,
            "base_pts": base, "final_pts": final_pts,
            "proportions": proportions, "stats": st, "breakdown": categorized_bd,
        })

    role_str = player.role.value if hasattr(player.role, "value") else str(player.role)
    return {
        "player": {
            "id": player.id, "name": player.name,
            "role": role_str.split(".")[-1], "ipl_team": player.ipl_team,
            "fantasy_team": player.team.name if player.team else "Unsold",
        },
        "season_summary": {
            "total_pts": round(total_base, 1),
            "base_pts": round(total_base, 1),
            "mult_bonus": 0,
            "avg_pts": round(total_base / max(total_completed_matches, 1), 1),
            "matches_played": len(scores),
            "total_matches": total_completed_matches,
            "c_times": c_times, "vc_times": vc_times,
        },
        "matches": matches_arr,
    }


# ─── ADMIN ───────────────────────────────────────────────────────────────────

@app.get("/admin/picks/match/{match_id}")
def get_admin_picks_for_match(match_id: int, db: Session = Depends(get_db),
                              current_admin: dict = Depends(auth.get_current_admin)):
    """Return all teams' captain/vc picks for a specific match (any match, including past)."""
    match = db.query(models.Match).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    teams = db.query(models.Team).all()
    res = []
    for t in teams:
        pick = db.query(models.CaptainPick).filter_by(match_id=match_id, fantasy_team_id=t.id).first()
        t_dict = {
            "team_id": t.id, "team_name": t.name, "owner": t.owner_name,
            "submitted": False, "c_name": None, "vc_name": None,
            "captain_player_id": None, "vc_player_id": None,
            "match_id": match_id,
        }
        if pick and pick.is_locked:
            t_dict["submitted"] = True
            c_player = db.query(models.Player).filter_by(id=pick.captain_player_id).first()
            vc_player = db.query(models.Player).filter_by(id=pick.vc_player_id).first()
            t_dict["c_name"] = c_player.name if c_player else "Unknown"
            t_dict["vc_name"] = vc_player.name if vc_player else "Unknown"
            t_dict["captain_player_id"] = pick.captain_player_id
            t_dict["vc_player_id"] = pick.vc_player_id
        res.append(t_dict)
    return res


@app.get("/admin/picks/today")
def get_admin_picks_today(db: Session = Depends(get_db),
                          current_admin: dict = Depends(auth.get_current_admin)):
    teams = db.query(models.Team).all()
    match = (db.query(models.Match)
             .filter(models.Match.is_completed == False)
             .order_by(models.Match.deadline)
             .first())
    res = []
    if not match:
        return res
    for t in teams:
        pick = (db.query(models.CaptainPick)
                .filter_by(match_id=match.id, fantasy_team_id=t.id)
                .first())
        t_dict = {
            "team_id": t.id, "team_name": t.name, "owner": t.owner_name,
            "submitted": False, "c_name": None, "vc_name": None,
            "captain_player_id": None, "vc_player_id": None,
            "match_id": match.id,
            "time_remaining": match.deadline.isoformat() + "Z",
        }
        if pick and pick.is_locked:
            t_dict["submitted"] = True
            c_player = db.query(models.Player).filter_by(id=pick.captain_player_id).first()
            vc_player = db.query(models.Player).filter_by(id=pick.vc_player_id).first()
            t_dict["c_name"] = c_player.name if c_player else "Unknown"
            t_dict["vc_name"] = vc_player.name if vc_player else "Unknown"
            t_dict["captain_player_id"] = pick.captain_player_id
            t_dict["vc_player_id"] = pick.vc_player_id
        res.append(t_dict)
    return res


@app.get("/admin/matches")
def get_admin_matches(db: Session = Depends(get_db),
                      current_admin: dict = Depends(auth.get_current_admin)):
    matches = db.query(models.Match).order_by(models.Match.match_date).all()
    return [_serialize_match(m) for m in matches]


@app.post("/admin/force-sync-schedule")
def force_sync_schedule(current_admin: dict = Depends(auth.get_current_admin)):
    try:
        count = cricket_sync.sync_ipl_schedule()
        from database import SessionLocal
        db = SessionLocal()
        total = db.query(models.Match).count()
        db.close()
        return {"status": "success", "new_matches_added": count, "matches_in_db": total}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.post("/admin/sync-match/{match_id}")
def sync_admin_match(match_id: int, cricket_live_id: Optional[int] = None,
                     db: Session = Depends(get_db),
                     current_admin: dict = Depends(auth.get_current_admin)):
    if cricket_live_id is not None:
        match = db.query(models.Match).filter_by(id=match_id).first()
        if match:
            match.cricket_live_match_id = cricket_live_id
            db.commit()
    result = cricket_sync.sync_match_points(match_id)
    return result


@app.put("/admin/matches/{match_id}/cricket-live-id")
def set_cricket_live_id(match_id: int, cricket_live_id: Optional[int] = None,
                        db: Session = Depends(get_db),
                        current_admin: dict = Depends(auth.get_current_admin)):
    match = db.query(models.Match).filter_by(id=match_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    match.cricket_live_match_id = cricket_live_id
    db.commit()
    return {"status": "ok", "cricket_live_match_id": cricket_live_id}


@app.get("/admin/players-for-match/{match_id}")
def get_players_for_match(match_id: int, db: Session = Depends(get_db),
                          current_admin: dict = Depends(auth.get_current_admin)):
    """Return all players who have a score entry for this match (for manual adjustment UI)."""
    scores = db.query(models.MatchScore).filter_by(match_id=match_id).all()
    result = []
    for s in scores:
        player = db.query(models.Player).filter_by(id=s.player_id).first()
        if not player:
            continue
        result.append({
            "player_id": player.id,
            "player_name": player.name,
            "fantasy_team_id": player.team_id,
            "fantasy_points_base": s.fantasy_points_base,
            "manual_points": s.manual_points or 0,
            "fantasy_points_final": s.fantasy_points_final,
        })
    return sorted(result, key=lambda x: x["player_name"])


@app.get("/admin/team-players/{team_id}")
def get_team_players_admin(team_id: int, db: Session = Depends(get_db),
                           current_admin: dict = Depends(auth.get_current_admin)):
    """Return all players in a fantasy team squad (for admin captaincy assignment)."""
    players = db.query(models.Player).filter_by(team_id=team_id).order_by(models.Player.name).all()
    return [{"id": p.id, "name": p.name, "role": p.role, "ipl_team": p.ipl_team} for p in players]


@app.post("/admin/set-pick")
def admin_set_pick(body: dict, db: Session = Depends(get_db),
                   current_admin: dict = Depends(auth.get_current_admin)):
    """Admin override: set or update captain/vc for any team in any match, ignoring deadline."""
    match_id = body.get("match_id")
    team_id = body.get("team_id")
    captain_id = body.get("captain_player_id")
    vc_id = body.get("vc_player_id")
    if not all([match_id, team_id, captain_id]):
        raise HTTPException(status_code=400, detail="match_id, team_id, captain_player_id are required")
    if vc_id and captain_id == vc_id:
        raise HTTPException(status_code=400, detail="Captain and VC must be different players")
    existing = db.query(models.CaptainPick).filter_by(match_id=match_id, fantasy_team_id=team_id).first()
    if existing:
        existing.captain_player_id = captain_id
        existing.vc_player_id = vc_id  # may be None
        existing.is_locked = True
    else:
        db.add(models.CaptainPick(
            fantasy_team_id=team_id,
            match_id=match_id,
            captain_player_id=captain_id,
            vc_player_id=vc_id,  # may be None
            is_locked=True,
        ))
    db.commit()
    c = db.query(models.Player).filter_by(id=captain_id).first()
    vc = db.query(models.Player).filter_by(id=vc_id).first() if vc_id else None
    return {"status": "success", "captain": c.name if c else "?", "vc": vc.name if vc else "—"}


@app.post("/admin/adjust-points/{match_id}/{player_id}")
def adjust_player_points(match_id: int, player_id: int,
                         points: float = 0,
                         base_pts: Optional[float] = None,
                         db: Session = Depends(get_db),
                         current_admin: dict = Depends(auth.get_current_admin)):
    """Adjust points for a player in a match.
    - points: added to manual_points (can be negative)
    - base_pts: if provided, directly overrides fantasy_points_base
    """
    ms = db.query(models.MatchScore).filter_by(match_id=match_id, player_id=player_id).first()
    if not ms:
        raise HTTPException(status_code=404, detail="No score entry for this player/match")
    if base_pts is not None:
        ms.fantasy_points_base = base_pts
    ms.manual_points = (ms.manual_points or 0) + points
    ms.fantasy_points_final = ms.fantasy_points_base + ms.manual_points
    db.commit()
    return {
        "status": "ok",
        "player_id": player_id,
        "match_id": match_id,
        "fantasy_points_base": ms.fantasy_points_base,
        "manual_points": ms.manual_points,
        "fantasy_points_final": ms.fantasy_points_final,
    }


@app.delete("/admin/match-score/{match_id}/{player_id}")
def delete_player_match_score(match_id: int, player_id: int,
                              db: Session = Depends(get_db),
                              current_admin: dict = Depends(auth.get_current_admin)):
    """Completely remove a player's score entry for a match (e.g. wrong match attribution)."""
    ms = db.query(models.MatchScore).filter_by(match_id=match_id, player_id=player_id).first()
    if not ms:
        raise HTTPException(status_code=404, detail="No score entry found for this player/match")
    db.delete(ms)
    db.commit()
    return {"status": "deleted", "player_id": player_id, "match_id": match_id}


@app.get("/admin/test-dots/{cricbuzz_id}")
def test_dots(cricbuzz_id: int, current_admin: dict = Depends(auth.get_current_admin)):
    """Debug: test all dot ball sources for a given cricbuzz_id."""
    v2 = cricket_sync.fetch_dot_balls_from_scard_v2(cricbuzz_id)
    comm = cricket_sync.fetch_dot_balls_from_commentary(cricbuzz_id)
    return {
        "cricbuzz_id": cricbuzz_id,
        "v2_scorecard_dots": v2,
        "commentary_dots": comm,
        "source_used": "v2_scorecard" if v2 else ("commentary" if comm else "none"),
    }


@app.get("/admin/raw-comm/{cricbuzz_id}")
def raw_comm(cricbuzz_id: int, current_admin: dict = Depends(auth.get_current_admin)):
    """Debug: return raw comwrapper structure from Cricbuzz comm endpoint."""
    data = cricket_sync._cricbuzz_get(f"mcenter/v1/{cricbuzz_id}/comm")
    if not data:
        return {"error": "no response"}
    cw = data.get("comwrapper")
    if isinstance(cw, dict):
        # Show its keys and first commentary entry if nested
        result = {"comwrapper_type": "dict", "comwrapper_keys": list(cw.keys())}
        for k, v in cw.items():
            if isinstance(v, list) and v:
                result[f"{k}_sample"] = v[:2]
                result[f"{k}_count"] = len(v)
        return result
    elif isinstance(cw, list):
        result = {"comwrapper_type": "list", "comwrapper_length": len(cw)}
        if cw:
            first = cw[0]
            result["first_item_type"] = type(first).__name__
            if isinstance(first, dict):
                result["first_item_keys"] = list(first.keys())
                # Show sample of nested commentary
                for k, v in first.items():
                    if isinstance(v, list) and v:
                        result[f"first.{k}_sample"] = v[:2]
        return result
    return {"comwrapper_raw_type": type(cw).__name__, "sample": str(cw)[:500]}


@app.get("/admin/debug-cricket-live/{cl_match_id}")
def debug_cricket_live(cl_match_id: int, innings: int = 1,
                       current_admin: dict = Depends(auth.get_current_admin)):
    """Debug: show raw ball objects from Cricket Live Line for a match/innings.
    Helps identify actual field names for bye/legbye/wicket events."""
    data = cricket_sync._cricket_live_get(f"matches/{cl_match_id}/innings/{innings}/commentary")
    if not data:
        return {"error": "no response from Cricket Live Line"}
    balls = cricket_sync._cl_extract_balls(data)
    event_types = {}
    for b in balls:
        ev = str(b.get("event") or "NONE")
        if ev not in event_types:
            event_types[ev] = b  # save one sample per event type
    return {
        "total_balls": len(balls),
        "event_types_found": list(event_types.keys()),
        "sample_per_event": event_types,
        "first_5_balls": balls[:5],
    }


@app.post("/admin/override-pick/{team_id}")
def override_team_pick(team_id: int, db: Session = Depends(get_db),
                       current_admin: dict = Depends(auth.get_current_admin)):
    match = (db.query(models.Match)
             .filter(models.Match.is_completed == False)
             .order_by(models.Match.deadline)
             .first())
    if not match:
        raise HTTPException(status_code=404, detail="No active match")
    pick = db.query(models.CaptainPick).filter_by(match_id=match.id, fantasy_team_id=team_id).first()
    if pick:
        db.delete(pick)
        db.commit()
    return {"status": "success"}


@app.get("/admin/audit/{match_id}")
def get_admin_audit(match_id: int, db: Session = Depends(get_db),
                    current_admin: dict = Depends(auth.get_current_admin)):
    scores = db.query(models.MatchScore).filter_by(match_id=match_id).all()
    all_picks = (db.query(models.CaptainPick)
                 .filter_by(match_id=match_id, is_locked=True)
                 .all())

    result = []
    for s in scores:
        player = db.query(models.Player).filter_by(id=s.player_id).first()
        if not player:
            continue
        ipl_team = player.ipl_team
        fantasy_team = player.team.name if player.team else "?"

        # Find if this player was anyone's C or VC
        entries = []
        for pick in all_picks:
            ft = db.query(models.Team).filter_by(id=pick.fantasy_team_id).first()
            ft_name = ft.name if ft else "?"
            eff = s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base
            if pick.captain_player_id == s.player_id:
                entries.append({
                    "player_name": player.name, "ipl_team": ipl_team,
                    "fantasy_team": ft_name, "base_pts": eff,
                    "multiplier": 2.0,
                    "final_pts": round(eff * 2.0, 1),
                    "is_c": True, "is_vc": False,
                })
            elif pick.vc_player_id == s.player_id:
                entries.append({
                    "player_name": player.name, "ipl_team": ipl_team,
                    "fantasy_team": ft_name, "base_pts": eff,
                    "multiplier": 1.5,
                    "final_pts": round(eff * 1.5, 1),
                    "is_c": False, "is_vc": True,
                })

        if not entries:
            eff = s.fantasy_points_final if s.fantasy_points_final else s.fantasy_points_base
            result.append({
                "player_name": player.name, "ipl_team": ipl_team,
                "fantasy_team": fantasy_team, "base_pts": eff,
                "multiplier": 1.0, "final_pts": eff,
                "is_c": False, "is_vc": False,
            })
        else:
            result.extend(entries)

    return sorted(result, key=lambda x: x["final_pts"], reverse=True)


@app.post("/admin/players")
def admin_upsert_player(data: schemas.PlayerUpsert, db: Session = Depends(get_db),
                        current_admin: dict = Depends(auth.get_current_admin)):
    if data.id:
        player = db.query(models.Player).filter_by(id=data.id).first()
        if not player:
            raise HTTPException(status_code=404, detail="Player not found")
    else:
        player = models.Player()
        db.add(player)

    player.name = data.name
    player.team_id = data.team_id
    player.ipl_team = data.ipl_team
    try:
        player.role = models.RoleEnum[data.role]
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {data.role}")
    if data.cricketdata_player_id is not None:
        player.cricketdata_player_id = data.cricketdata_player_id

    db.commit()
    db.refresh(player)
    return {"status": "success", "player_id": player.id}


@app.get("/")
def read_root():
    return {"message": "IPL Fantasy 2026 API"}
