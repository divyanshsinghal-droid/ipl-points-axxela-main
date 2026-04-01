import os, re, requests, difflib, logging, asyncio, json
from collections import defaultdict
from datetime import datetime, timedelta
from database import SessionLocal
import models, scoring

logging.basicConfig(level=logging.INFO)

# ── cricapi.com (schedule sync) ───────────────────────────────────────────────
CRICKETDATA_API_KEY = os.getenv("CRICKETDATA_API_KEY", "")
CRICAPI_BASE = "https://api.cricapi.com/v1"

# ── Cricbuzz via RapidAPI (scorecard) ─────────────────────────────────────────
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
CRICBUZZ_HOST = "cricbuzz-cricket.p.rapidapi.com"
CRICBUZZ_BASE = f"https://{CRICBUZZ_HOST}"
CRICBUZZ_HEADERS = {
    "X-RapidAPI-Key": RAPIDAPI_KEY,
    "X-RapidAPI-Host": CRICBUZZ_HOST,
}

# ── Cricket Live Line Advance (ball-by-ball dot balls) ────────────────────────
CRICKET_LIVE_KEY = os.getenv("CRICKET_LIVE_KEY", "")
CRICKET_LIVE_HOST = "cricket-live-line-advance.p.rapidapi.com"
CRICKET_LIVE_BASE = f"https://{CRICKET_LIVE_HOST}"
CRICKET_LIVE_HEADERS = {
    "x-rapidapi-key": CRICKET_LIVE_KEY,
    "x-rapidapi-host": CRICKET_LIVE_HOST,
    "Content-Type": "application/json",
}


# ─── Generic helpers ─────────────────────────────────────────────────────────

def _cricapi_get(endpoint: str, params: dict, timeout: int = 10):
    params["apikey"] = CRICKETDATA_API_KEY
    try:
        res = requests.get(f"{CRICAPI_BASE}/{endpoint}", params=params, timeout=timeout)
        data = res.json()
        if data.get("status") == "success":
            return data
        logging.warning(f"cricapi {endpoint}: {data.get('status')} — {data.get('reason','')}")
    except Exception as e:
        logging.error(f"cricapi {endpoint} error: {e}")
    return None


def _cricbuzz_get(endpoint: str, timeout: int = 15):
    try:
        res = requests.get(f"{CRICBUZZ_BASE}/{endpoint}", headers=CRICBUZZ_HEADERS, timeout=timeout)
        if res.status_code == 200:
            return res.json()
        logging.warning(f"Cricbuzz {endpoint}: HTTP {res.status_code}")
    except Exception as e:
        logging.error(f"Cricbuzz {endpoint} error: {e}")
    return None


def _cricket_live_get(path: str, timeout: int = 15):
    try:
        res = requests.get(f"{CRICKET_LIVE_BASE}/{path}", headers=CRICKET_LIVE_HEADERS, timeout=timeout)
        if res.status_code == 200:
            return res.json()
        logging.warning(f"CricketLive {path}: HTTP {res.status_code}")
    except Exception as e:
        logging.error(f"CricketLive {path} error: {e}")
    return None


def _team_match(a: str, b: str) -> bool:
    return difflib.SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio() > 0.75


# ─── Schedule sync (cricapi.com) ──────────────────────────────────────────────

def find_ipl_series_id() -> str | None:
    for term in ("Indian Premier League 2026", "IPL 2026", "Indian Premier League"):
        data = _cricapi_get("series", {"offset": 0, "search": term})
        if not data:
            continue
        for s in data.get("data", []):
            name = s.get("name", "").lower()
            if ("indian premier league" in name or "ipl" in name) and ("2026" in name or "2025" in name):
                logging.info(f"Found IPL series: {s['name']} ({s['id']})")
                return s["id"]
        # Fallback: any IPL series
        for s in data.get("data", []):
            if "indian premier league" in s.get("name", "").lower():
                return s["id"]
    return None


def sync_ipl_schedule():
    if not CRICKETDATA_API_KEY:
        logging.warning("No CRICKETDATA_API_KEY — skipping schedule sync")
        return 0

    series_id = find_ipl_series_id()
    if series_id:
        data = _cricapi_get("series_info", {"id": series_id})
        if data:
            return _store_matches_from_series(data.get("data", {}).get("matchList", []))

    return _sync_schedule_fallback()


def _store_matches_from_series(match_list: list) -> int:
    count = 0
    with SessionLocal() as db:
        for match in match_list:
            if match.get("matchType", "").lower() not in ("t20", ""):
                continue
            m_id = str(match.get("id", ""))
            if not m_id:
                continue
            existing = db.query(models.Match).filter_by(ipl_match_id=m_id).first()
            if existing:
                status = match.get("status", "").lower()
                if any(w in status for w in ("won", "draw", "tied", "abandoned")) and not existing.is_completed:
                    existing.is_completed = True
                continue
            try:
                dt = datetime.strptime(match["dateTimeGMT"], "%Y-%m-%dT%H:%M:%S")
            except Exception:
                try:
                    dt = datetime.strptime(match["date"], "%Y-%m-%d")
                except Exception:
                    continue
            teams = match.get("teams", ["TBD", "TBD"])
            status = match.get("status", "").lower()
            db.add(models.Match(
                ipl_match_id=m_id,
                match_date=dt,
                team1=teams[0] if teams else "TBD",
                team2=teams[1] if len(teams) > 1 else "TBD",
                deadline=dt - timedelta(minutes=30),
                is_completed=any(w in status for w in ("won", "draw", "tied", "abandoned")),
            ))
            count += 1
        db.commit()
    logging.info(f"Synced {count} new IPL matches")
    return count


def _sync_schedule_fallback():
    count = 0
    offset = 0
    with SessionLocal() as db:
        while True:
            data = _cricapi_get("matches", {"offset": offset})
            if not data:
                break
            batch = data.get("data", [])
            if not batch:
                break
            for m in batch:
                name = m.get("name", "").lower()
                if "ipl" not in name and "indian premier league" not in name:
                    continue
                if m.get("matchType", "").lower() not in ("t20", ""):
                    continue
                m_id = str(m.get("id", ""))
                if not m_id or db.query(models.Match).filter_by(ipl_match_id=m_id).first():
                    continue
                try:
                    dt = datetime.strptime(m["dateTimeGMT"], "%Y-%m-%dT%H:%M:%S")
                except Exception:
                    continue
                teams = m.get("teams", ["TBD", "TBD"])
                status = m.get("status", "").lower()
                db.add(models.Match(
                    ipl_match_id=m_id,
                    match_date=dt,
                    team1=teams[0] if teams else "TBD",
                    team2=teams[1] if len(teams) > 1 else "TBD",
                    deadline=dt - timedelta(minutes=30),
                    is_completed=any(w in status for w in ("won", "draw", "tied")),
                ))
                count += 1
            if len(batch) < 25:
                break
            offset += 25
        db.commit()
    return count


# ─── Cricbuzz scorecard ───────────────────────────────────────────────────────

def find_cricbuzz_match_id(team1: str, team2: str) -> int | None:
    """Search Cricbuzz recent + upcoming matches to find the Cricbuzz match ID."""
    for endpoint in ("matches/v1/recent", "matches/v1/upcoming"):
        data = _cricbuzz_get(endpoint)
        if not data:
            continue
        for type_obj in data.get("typeMatches", []):
            for series in type_obj.get("seriesMatches", []):
                s = series.get("seriesAdWrapper", {})
                if "premier league" not in s.get("seriesName", "").lower():
                    continue
                for m in s.get("matches", []):
                    mi = m.get("matchInfo", {})
                    cb_t1 = mi.get("team1", {}).get("teamName", "")
                    cb_t2 = mi.get("team2", {}).get("teamName", "")
                    if ((_team_match(team1, cb_t1) and _team_match(team2, cb_t2)) or
                            (_team_match(team1, cb_t2) and _team_match(team2, cb_t1))):
                        return mi.get("matchId")
    return None


def _default_stats() -> dict:
    return {
        "runs": 0, "balls_faced": 0, "fours": 0, "sixes": 0,
        "dismissed": False, "in_playing_xi": True,
        "wickets": 0, "dot_balls": 0, "maidens": 0,
        "balls_bowled": 0, "runs_conceded": 0,
        "catches": 0, "run_outs": 0, "stumpings": 0,
        "lbw_bowled": 0,
    }


def _parse_outdec(outdec: str, bowler_name: str, raw_stats: dict):
    """
    Parse Cricbuzz dismissal text to assign fielding points and LBW/bowled bonus.

    Examples:
      'c Hardik Pandya b Shardul Thakur'  → Hardik Pandya +catch
      'c & b Jasprit Bumrah'              → Bumrah +catch
      'st Ishan Kishan b Kuldeep Yadav'   → Ishan Kishan +stumping
      'run out (Virat Kohli)'             → Virat Kohli +runout
      'lbw b Jasprit Bumrah'             → Bumrah +lbw_bowled
      'b Jasprit Bumrah'                 → Bumrah +lbw_bowled (bowled)
    """
    if not outdec:
        return
    txt = outdec.strip()
    low = txt.lower()

    def ensure(name):
        if name and name not in raw_stats:
            stats = _default_stats()
            # Only appears in dismissal text — not in batting/bowling XI.
            # Treat as substitute fielder: no playing XI bonus, no catch points blocked.
            stats["in_playing_xi"] = False
            raw_stats[name] = stats

    # LBW
    if low.startswith("lbw"):
        ensure(bowler_name)
        if bowler_name:
            raw_stats[bowler_name]["lbw_bowled"] += 1

    # Bowled (starts with "b " but not "b&t")
    elif re.match(r'^b\s+\S', low) and not low.startswith("b&t"):
        ensure(bowler_name)
        if bowler_name:
            raw_stats[bowler_name]["lbw_bowled"] += 1

    # Caught and bowled: "c & b BowlerName"
    elif re.match(r'^c\s*&\s*b\s+', low):
        ensure(bowler_name)
        if bowler_name:
            raw_stats[bowler_name]["catches"] += 1

    # Caught: "c FielderName b BowlerName"
    elif low.startswith("c "):
        parts = txt[2:].split(" b ", 1)
        if parts:
            fielder = parts[0].strip()
            ensure(fielder)
            if fielder:
                raw_stats[fielder]["catches"] += 1

    # Stumped: "st KeeperName b BowlerName"
    elif low.startswith("st "):
        parts = txt[3:].split(" b ", 1)
        if parts:
            keeper = parts[0].strip()
            ensure(keeper)
            if keeper:
                raw_stats[keeper]["stumpings"] += 1

    # Run out: "run out (FielderName)" or "run out (A/B)"
    elif "run out" in low:
        m = re.search(r'\(([^/)]+)', txt)
        if m:
            fielder = m.group(1).strip()
            ensure(fielder)
            if fielder:
                raw_stats[fielder]["run_outs"] += 1


def fetch_cricbuzz_scorecard(cricbuzz_id: int) -> list | None:
    data = _cricbuzz_get(f"mcenter/v1/{cricbuzz_id}/scard")
    if data:
        return data.get("scorecard", [])
    return None


# ─── cricketdata.org scorecard (primary scorecard source) ────────────────────

def fetch_cricketdata_scorecard(ipl_match_id: str) -> list | None:
    """Fetch full scorecard from cricketdata.org. Returns list of innings dicts."""
    data = _cricapi_get("match_scorecard", {"id": ipl_match_id})
    if data:
        sc = data.get("data", {}).get("scorecard")
        if sc:
            return sc
    return None


def parse_cricketdata_scorecard(scorecard: list) -> dict:
    """
    Parse cricketdata.org scorecard into per-player stats dict.

    Format per innings:
      batting: [{batsman: {name}, r, b, 4s, 6s, dismissal-text, bowler: {name}}, ...]
      bowling: [{bowler: {name}, o, m, r, w, nb, wd}, ...]
    """
    raw_stats = {}

    def ensure(name):
        if name and name not in raw_stats:
            raw_stats[name] = _default_stats()
        # Anyone appearing in batting/bowling sections is in the playing XI.
        # This corrects players initially created as sub-fielders by _parse_outdec.
        if name:
            raw_stats[name]["in_playing_xi"] = True

    def _name(field):
        if isinstance(field, dict):
            return (field.get("name") or "").strip()
        return str(field or "").strip()

    def _overs_to_balls(o) -> int:
        try:
            f = float(o)
            whole = int(f)
            part = round((f - whole) * 10)  # 3.4 → 4 balls
            return whole * 6 + part
        except Exception:
            return 0

    for inn in scorecard:
        # ── BATTING ──────────────────────────────────────────────────────────
        for bat in inn.get("batting", []):
            name = _name(bat.get("batsman"))
            if not name:
                continue
            ensure(name)
            raw_stats[name]["runs"] += int(bat.get("r", 0) or 0)
            raw_stats[name]["balls_faced"] += int(bat.get("b", 0) or 0)
            raw_stats[name]["fours"] += int(bat.get("4s", 0) or 0)
            raw_stats[name]["sixes"] += int(bat.get("6s", 0) or 0)

            outdec = bat.get("dismissal-text", "") or ""
            if outdec.lower().strip() not in ("not out", "dnb", "absent", "retired hurt", ""):
                raw_stats[name]["dismissed"] = True

            bowler_name = _name(bat.get("bowler"))
            _parse_outdec(outdec, bowler_name, raw_stats)

        # ── BOWLING ──────────────────────────────────────────────────────────
        for bowl in inn.get("bowling", []):
            name = _name(bowl.get("bowler"))
            if not name:
                continue
            ensure(name)
            raw_stats[name]["wickets"] += int(bowl.get("w", 0) or 0)
            raw_stats[name]["maidens"] += int(bowl.get("m", 0) or 0)
            raw_stats[name]["balls_bowled"] += _overs_to_balls(bowl.get("o", 0))
            raw_stats[name]["runs_conceded"] += int(bowl.get("r", 0) or 0)
            # dot_balls left as 0 — filled by Cricket Live Line later

    return raw_stats


def _parse_commentary_page(commentary_list: list, dot_counts: dict):
    """Parse one page of Cricbuzz commentary balls into dot_counts dict (mutates in place).
    Wicket balls, bye balls, and leg-bye balls all count as dots for the bowler."""
    for ball in commentary_list:
        event = (ball.get("event") or "").upper()
        # Skip wides and no-balls — not counted as dot balls
        if event in ("WIDE", "NOBALL", "NO BALL", "NO-BALL"):
            continue
        # Also skip if commText clearly says wide/no-ball
        comm = (ball.get("commText") or "").lower()
        if comm.startswith("wide") or comm.startswith("no ball"):
            continue

        bat_runs = ball.get("batRuns")
        total_runs = ball.get("totalRuns")

        # Byes and leg-byes: runs went as extras, bat scored 0 → always a dot
        is_bye_or_legbye = event in ("BYE", "LEGBYE", "LEG BYE", "LEG-BYE")

        if is_bye_or_legbye:
            # Only a dot if bat didn't score (batRuns == 0 or absent)
            is_dot = bat_runs is None or int(bat_runs) == 0
        elif bat_runs is not None:
            # Normal ball or wicket: dot if bat scored 0
            is_dot = int(bat_runs) == 0
        elif total_runs is not None:
            # Fallback: if no batRuns field, use totalRuns (covers wicket balls with 0 total)
            is_dot = int(total_runs) == 0
        else:
            is_dot = False

        if not is_dot:
            continue

        bowler_info = ball.get("bowlerStriker") or {}
        bowler_name = (bowler_info.get("bowlName") or "").strip()
        if not bowler_name:
            continue

        dot_counts[bowler_name] = dot_counts.get(bowler_name, 0) + 1


def _extract_commentary_list(data: dict, _depth: int = 0) -> list:
    """Try multiple key names to extract the ball-by-ball list from a Cricbuzz response."""
    if _depth > 5 or not isinstance(data, dict):
        return []

    for key in ("commentaryList", "commentary", "comm", "commData", "commentsData",
                "ballCommentary", "comwrapper"):
        val = data.get(key)
        if val is None:
            continue

        if isinstance(val, list) and val:
            # If items look like ball entries (have batRuns/totalRuns/event), return directly
            if isinstance(val[0], dict) and any(
                    k in val[0] for k in ("batRuns", "totalRuns", "event", "commText", "ballNbr")):
                return val
            # Otherwise recurse into each list item (innings wrappers)
            combined = []
            for item in val:
                combined.extend(_extract_commentary_list(item, _depth + 1))
            if combined:
                return combined

        if isinstance(val, dict):
            # Log sub-keys at depth 0 so we can see what's inside comwrapper
            if _depth == 0:
                logging.info(f"  {key} sub-keys: {list(val.keys())}")
            inner = _extract_commentary_list(val, _depth + 1)
            if inner:
                return inner

    return []


def fetch_dot_balls_from_commentary(cricbuzz_id: int) -> dict:
    """
    Fetch ball-by-ball commentary from Cricbuzz and count dot balls per bowler.
    Returns {bowler_name: dot_ball_count}.
    Tries multiple endpoint paths and key names.
    """
    dot_counts = {}

    # Try possible commentary endpoint paths (with and without page param)
    candidate_paths = [
        f"mcenter/v1/{cricbuzz_id}/comm",
        f"mcenter/v1/{cricbuzz_id}/comm?page=1",
        f"mcenter/v1/{cricbuzz_id}/commentary",
        f"matches/get-commentaries?matchId={cricbuzz_id}",
        f"matches/get-commentaries-v2?matchId={cricbuzz_id}",
        f"mcenter/v1/{cricbuzz_id}/overs",
        f"matches/get-overs?matchId={cricbuzz_id}",
    ]

    working_base = None
    first_data = None

    for path in candidate_paths:
        data = _cricbuzz_get(path)
        if not data:
            continue
        # Log all top-level keys so we can see what's available
        logging.info(f"Cricbuzz {path} → keys: {list(data.keys())}")
        comm_list = _extract_commentary_list(data)
        if comm_list:
            working_base = path.split("?")[0]  # strip query for pagination
            first_data = data
            logging.info(f"Commentary endpoint found: {path} ({len(comm_list)} entries)")
            break

    if not working_base or not first_data:
        logging.warning(f"No commentary endpoint worked for Cricbuzz ID {cricbuzz_id}")
        return dot_counts

    # Parse first page
    _parse_commentary_page(_extract_commentary_list(first_data), dot_counts)

    # Try to find totalPages (Cricbuzz comwrapper nests it)
    def _get_total_pages(d: dict) -> int:
        for key in ("totalPages", "totalPage", "total_pages"):
            v = d.get(key)
            if v:
                try: return int(v)
                except Exception: pass
        # Check inside comwrapper list items
        for item in d.get("comwrapper", []) if isinstance(d.get("comwrapper"), list) else []:
            if isinstance(item, dict):
                v = _get_total_pages(item)
                if v > 1:
                    return v
        # Check nested dict values
        for val in d.values():
            if isinstance(val, dict):
                v = _get_total_pages(val)
                if v > 1:
                    return v
        return 1

    total_pages = _get_total_pages(first_data)
    logging.info(f"Commentary total pages: {total_pages}")

    for page in range(1, min(total_pages, 30)):  # cap at 30 pages
        sep = "&" if "?" in working_base else "?"
        data = _cricbuzz_get(f"{working_base}{sep}page={page}")
        if not data:
            break
        page_list = _extract_commentary_list(data)
        if not page_list:
            break
        _parse_commentary_page(page_list, dot_counts)

    logging.info(f"Commentary dot balls counted: {dot_counts}")
    return dot_counts


# ─── Cricket Live Line Advance — dot balls from ball-by-ball commentary ───────

def find_cricket_live_match_id(team1: str, team2: str) -> int | None:
    """Search Cricket Live Line API for the match ID matching team1 vs team2."""
    for endpoint in ("matches/live", "matches/recent", "matches"):
        data = _cricket_live_get(endpoint)
        if not data:
            continue
        # Response shape: {"response": {"items": [...]}}
        response = data.get("response") or {}
        items = (response.get("items") or response.get("matches") or
                 response.get("data") or [])
        if not isinstance(items, list):
            continue
        for m in items:
            # Team names come from title: "Mumbai Indians vs Kolkata Knight Riders"
            title = str(m.get("title") or "")
            parts = title.split(" vs ", 1)
            if len(parts) == 2:
                t1, t2 = parts[0].strip(), parts[1].strip()
            else:
                t1 = str(m.get("team1_name") or m.get("team1") or "")
                t2 = str(m.get("team2_name") or m.get("team2") or "")
            if ((_team_match(team1, t1) and _team_match(team2, t2)) or
                    (_team_match(team1, t2) and _team_match(team2, t1))):
                mid = m.get("match_id") or m.get("id")
                if mid:
                    logging.info(f"CricketLive match ID {mid} for {team1} vs {team2} (title: {title})")
                    return int(mid)
    logging.warning(f"CricketLive: no match found for {team1} vs {team2}")
    return None


def _cl_extract_balls(data: dict) -> list:
    """Navigate Cricket Live Line response to find the commentaries list."""
    try:
        c = data["response"]["match"]["commentaries"]
        if isinstance(c, list):
            return c
    except (KeyError, TypeError):
        pass
    try:
        c = data["response"]["commentaries"]
        if isinstance(c, list):
            return c
    except (KeyError, TypeError):
        pass

    def _find(obj):
        if isinstance(obj, dict):
            if "commentaries" in obj and isinstance(obj["commentaries"], list):
                return obj["commentaries"]
            for v in obj.values():
                result = _find(v)
                if result is not None:
                    return result
        return None

    return _find(data) or []


def _cl_is_dot(ball: dict) -> bool:
    """A ball is a dot for the bowler if: not wide/no-ball, AND bat_run == 0.
    The API provides bat_run directly, so byes/leg-byes are automatically excluded."""
    if ball.get("wideball") or ball.get("noball"):
        return False
    try:
        bat_run = int(ball.get("bat_run", 0) or 0)
        return bat_run == 0
    except (ValueError, TypeError):
        return False


def _cl_bowler_name(ball: dict) -> str:
    commentary = ball.get("commentary", "")
    if " to " in commentary:
        return commentary.split(" to ")[0].strip()
    return ""


def fetch_dot_balls_from_cricket_live(team1: str, team2: str,
                                      stored_match_id: int | None = None) -> dict:
    """
    Fetch ball-by-ball commentary from Cricket Live Line API for both innings.
    Uses stored_match_id if provided, otherwise auto-discovers.
    Returns {bowler_name: dot_ball_count}.
    """
    if not CRICKET_LIVE_KEY:
        return {}

    match_id = stored_match_id or find_cricket_live_match_id(team1, team2)
    if not match_id:
        logging.warning(f"CricketLive: no match ID found for {team1} vs {team2}")
        return {}

    dot_counts: dict[str, int] = {}

    for innings in (1, 2):
        data = _cricket_live_get(f"matches/{match_id}/innings/{innings}/commentary")
        if not data:
            continue
        balls = _cl_extract_balls(data)

        # Log all unique event types so we can see the real API field values
        all_events = set(b.get("event") for b in balls)
        logging.info(f"CricketLive innings {innings}: {len(balls)} balls, event types seen: {all_events}")

        # Include ball/wicket events only; skip wides, no-balls, overend markers
        VALID_EVENTS = {"ball", "wicket"}
        ball_events = [b for b in balls
                       if str(b.get("event") or "").lower() in VALID_EVENTS
                       and not b.get("wideball") and not b.get("noball")]
        logging.info(f"CricketLive innings {innings}: {len(ball_events)} valid deliveries")

        # Use bowler_id as key to aggregate, then map to name
        bowler_stats: dict = defaultdict(lambda: {"name": "", "dots": 0})
        for ball in ball_events:
            bowler_id = str(ball.get("bowler_id", ""))
            if not bowler_id:
                continue
            name = _cl_bowler_name(ball)
            if name and not bowler_stats[bowler_id]["name"]:
                bowler_stats[bowler_id]["name"] = name

            # bat_run == 0 covers: dot balls, wickets, byes, leg-byes
            if _cl_is_dot(ball):
                bowler_stats[bowler_id]["dots"] += 1

        for stats in bowler_stats.values():
            name = stats["name"]
            dots = stats["dots"]
            if name and dots > 0:
                dot_counts[name] = dot_counts.get(name, 0) + dots

    logging.info(f"CricketLive dot balls: {dot_counts}")
    return dot_counts


def fetch_dot_balls_from_overs(cricbuzz_id: int) -> dict:
    """
    Parse dot balls from the overs endpoint's oversummary strings.
    oversummary example: "1 1 0 4 W 0 " — space-separated ball outcomes.
    '0' = dot ball, 'W' = wicket on 0 runs (also a dot), 'Wd'/'Nb' = not dots.
    Returns {bowler_name: dot_ball_count}.
    """
    data = _cricbuzz_get(f"mcenter/v1/{cricbuzz_id}/overs")
    if not data:
        return {}

    oversep = data.get("overseplist", {})
    if isinstance(oversep, dict):
        oversep = oversep.get("oversep", [])
    if not isinstance(oversep, list):
        return {}

    dot_counts = {}
    for over in oversep:
        summary = (over.get("oversummary") or "").strip()
        bowlers = over.get("ovrbowlnames") or []
        if not summary or not bowlers:
            continue

        bowler = bowlers[0].strip()  # one bowler per over
        balls = summary.split()
        dots = 0
        for ball in balls:
            b = ball.strip().upper()
            # Skip wides and no-balls
            if b in ("WD", "NB", "WDE", "W+NB") or b.startswith("WD") or b.startswith("NB"):
                continue
            # Dot: 0 runs or wicket on 0 runs
            if b == "0" or b == "W" or b == "0W":
                dots += 1

        if bowler and dots > 0:
            dot_counts[bowler] = dot_counts.get(bowler, 0) + dots

    logging.info(f"Overs endpoint dot balls: {dot_counts}")
    return dot_counts


def fetch_dot_balls_from_scard_v2(cricbuzz_id: int) -> dict:
    """
    Try the v2 scorecard endpoint which may include dot balls in bowling stats.
    Returns {bowler_name: dot_ball_count} or {} if unavailable.
    """
    dot_counts = {}
    # Try v2 scorecard endpoint variations
    for path in (
        f"mcenter/v1/{cricbuzz_id}/scard?version=2",
        f"mcenter/v1/{cricbuzz_id}/scard?ver=2",
        f"mcenter/v1/{cricbuzz_id}/bowling",
        f"matches/get-scorecard-v2?matchId={cricbuzz_id}",
        f"matches/get-scorecard-v2?id={cricbuzz_id}",
    ):
        data = _cricbuzz_get(path)
        if not data:
            continue
        logging.info(f"v2 scorecard {path} → keys: {list(data.keys())}")
        scorecard = data.get("scorecard", [])
        if not scorecard:
            continue
        for inn in scorecard:
            for bowl in inn.get("bowler", []):
                name = (bowl.get("name") or "").strip()
                dots = int(bowl.get("dots", 0) or bowl.get("dot_balls", 0) or 0)
                if name and dots > 0:
                    dot_counts[name] = dot_counts.get(name, 0) + dots
        if dot_counts:
            logging.info(f"v2 scorecard dots from {path}: {dot_counts}")
            return dot_counts
    return dot_counts


def parse_cricbuzz_scorecard(scorecard: list) -> dict:
    """
    Parse Cricbuzz scorecard into per-player stats dict.

    Cricbuzz format:
      batsman:  id, name, runs, balls, fours, sixes, strkrate, outdec, iscaptain, iskeeper
      bowler:   id, name, overs, maidens, wickets, runs, economy, dots, balls
    """
    raw_stats = {}

    def ensure(name):
        if name and name not in raw_stats:
            raw_stats[name] = _default_stats()
        # Anyone appearing in batting/bowling sections is in the playing XI.
        # This corrects players initially created as sub-fielders by _parse_outdec.
        if name:
            raw_stats[name]["in_playing_xi"] = True

    for inn in scorecard:
        # ── BATTING ──────────────────────────────────────────────────────────
        for bat in inn.get("batsman", []):
            name = bat.get("name", "").strip()
            if not name:
                continue
            ensure(name)
            raw_stats[name]["runs"] += int(bat.get("runs", 0) or 0)
            raw_stats[name]["balls_faced"] += int(bat.get("balls", 0) or 0)
            raw_stats[name]["fours"] += int(bat.get("fours", 0) or 0)
            raw_stats[name]["sixes"] += int(bat.get("sixes", 0) or 0)

            outdec = bat.get("outdec", "") or ""
            if outdec.lower().strip() not in ("not out", "dnb", "absent", "retired hurt", ""):
                raw_stats[name]["dismissed"] = True

            # Extract bowler name from dismissal text for lbw/bowled bonus
            bowler_name = ""
            if " b " in outdec:
                bowler_name = outdec.split(" b ")[-1].strip()

            _parse_outdec(outdec, bowler_name, raw_stats)

        # ── BOWLING ──────────────────────────────────────────────────────────
        for bowl in inn.get("bowler", []):
            name = bowl.get("name", "").strip()
            if not name:
                continue
            ensure(name)

            # Overs: "4" or "3.4" (3 overs + 4 balls)
            overs_str = str(bowl.get("overs", "0") or "0")
            if "." in overs_str:
                ov, b = overs_str.split(".", 1)
                balls_bowled = int(ov) * 6 + int(b)
            else:
                balls_bowled = int(float(overs_str)) * 6

            raw_stats[name]["wickets"] += int(bowl.get("wickets", 0) or 0)
            raw_stats[name]["maidens"] += int(bowl.get("maidens", 0) or 0)
            raw_stats[name]["dot_balls"] += int(bowl.get("dots", 0) or 0)
            raw_stats[name]["balls_bowled"] += balls_bowled
            raw_stats[name]["runs_conceded"] += int(bowl.get("runs", 0) or 0)

    return raw_stats


def _words_match(raw_name: str, db_name: str) -> bool:
    """
    Validate that every significant word (>3 chars) in raw_name fuzzy-matches
    at least one word in db_name (cutoff 0.75).

    Prevents surname-only matches like "Brijesh Sharma" → "Jitesh Sharma"
    while still allowing "Khaleel Ahmed" → "Syed Khaleel Ahmed".
    """
    raw_words = [w for w in raw_name.lower().split() if len(w) > 3]
    db_words = db_name.lower().split()
    if not raw_words:
        return True  # very short name — trust overall ratio
    for word in raw_words:
        if not difflib.get_close_matches(word, db_words, n=1, cutoff=0.7):
            return False
    return True


def _match_player(raw_name: str, db_names: dict) -> tuple | None:
    """
    Return (player_id, db_name) for the best matching DB player, or None.
    Uses difflib for overall similarity then word-level validation to reject
    false positives from shared surnames.
    """
    candidates = difflib.get_close_matches(raw_name, list(db_names.values()), n=3, cutoff=0.7)
    for candidate in candidates:
        if _words_match(raw_name, candidate):
            p_id = next(uid for uid, uname in db_names.items() if uname == candidate)
            return p_id, candidate
    return None


# ─── Main sync function ───────────────────────────────────────────────────────

def sync_match_points(match_id: int):
    with SessionLocal() as db:
        match = db.query(models.Match).filter_by(id=match_id).first()
        if not match:
            return {"status": "error", "message": "Match not found"}

        # ── Scorecard from cricketdata.org (uses stored ipl_match_id) ────────
        scorecard = fetch_cricketdata_scorecard(match.ipl_match_id)
        if not scorecard:
            return {"status": "no scorecard", "message": "Scorecard not yet available from cricketdata.org"}

        raw_stats = parse_cricketdata_scorecard(scorecard)
        if not raw_stats:
            return {"status": "no players", "message": "No player data in scorecard"}

        # ── Dot balls: Cricket Live Line (ball-by-ball) → Cricbuzz overs fallback
        dot_map = fetch_dot_balls_from_cricket_live(
            match.team1, match.team2,
            stored_match_id=match.cricket_live_match_id
        )
        dots_applied = []
        dots_synced = False
        if dot_map:
            dots_synced = True
            for cb_name, dot_count in dot_map.items():
                best = difflib.get_close_matches(cb_name, list(raw_stats.keys()), n=1, cutoff=0.7)
                if best:
                    raw_stats[best[0]]["dot_balls"] = dot_count
                    dots_applied.append(f"{best[0]}: {dot_count}")
            logging.info(f"Dot balls applied for {len(dot_map)} bowlers: {dot_map}")
        else:
            logging.info("Cricket Live Line match not found — dot balls will be 0, adjust manually if needed")

        logging.info(f"Parsed {len(raw_stats)} players: {list(raw_stats.keys())}")

        players_db = db.query(models.Player).all()
        db_names = {p.id: p.name for p in players_db}

        processed = 0
        matched = []
        unmatched = []
        already_processed = set()  # prevent duplicate writes (e.g. Phil Salt / Philip Salt)

        for raw_name, stat_dict in raw_stats.items():
            result_match = _match_player(raw_name, db_names)
            if not result_match:
                unmatched.append(raw_name)
                continue

            p_id, db_match = result_match

            # Skip duplicates (e.g. "Philip Salt" already stored under "Phil Salt")
            if p_id in already_processed:
                logging.info(f"Skipping duplicate match: {raw_name} → {db_match} (already stored)")
                continue
            already_processed.add(p_id)

            matched.append(f"{raw_name} → {db_match}")
            result = scoring.calculate_fantasy_points(stat_dict)

            ms = db.query(models.MatchScore).filter_by(match_id=match.id, player_id=p_id).first()
            if not ms:
                ms = models.MatchScore(match_id=match.id, player_id=p_id)

            ms.fantasy_points_base = result["total"]
            # Preserve any manual adjustment the admin made
            ms.fantasy_points_final = result["total"] + (ms.manual_points or 0)
            ms.runs = stat_dict["runs"]
            ms.wickets = stat_dict["wickets"]
            ms.catches = stat_dict["catches"]
            ms.balls_faced = stat_dict["balls_faced"]
            ms.fours = stat_dict["fours"]
            ms.sixes = stat_dict["sixes"]
            ms.dismissed = stat_dict["dismissed"]
            ms.dot_balls = stat_dict["dot_balls"]
            ms.lbw_bowled = stat_dict["lbw_bowled"]
            ms.maidens = stat_dict["maidens"]
            ms.balls_bowled = stat_dict["balls_bowled"]
            ms.runs_conceded = stat_dict["runs_conceded"]
            ms.run_outs = stat_dict["run_outs"]
            ms.stumpings = stat_dict["stumpings"]
            ms.stats_json = json.dumps(stat_dict)
            ms.breakdown_json = json.dumps(result["breakdown"])
            db.add(ms)
            processed += 1

        logging.info(f"Matched: {matched}")
        if unmatched:
            logging.warning(f"Unmatched (not in any squad): {unmatched}")

        match.is_completed = True
        db.commit()
        logging.info(f"Match {match_id}: synced {processed} players, {len(unmatched)} unmatched")
        return {
            "status": "success",
            "synced_players": processed,
            "matched": matched,
            "unmatched": unmatched,
            "dots_synced": dots_synced,
            "dots_applied": dots_applied,
        }


async def automated_sync_loop():
    """Disabled — use admin panel buttons to sync manually and preserve API quota."""
    await asyncio.sleep(999999)
