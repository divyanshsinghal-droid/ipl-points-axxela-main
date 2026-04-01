def calculate_fantasy_points(stats: dict) -> dict:
    pts = 0
    breakdown = {}

    # Playing XI bonus
    if stats.get("in_playing_xi"):
        pts += 4; breakdown["playing_xi"] = 4

    # Batting
    runs = stats.get("runs", 0)
    balls = stats.get("balls_faced", 0)
    fours = stats.get("fours", 0)
    sixes = stats.get("sixes", 0)
    dismissed = stats.get("dismissed", False)

    bat = runs + (fours * 4) + (sixes * 6)
    breakdown["runs"] = runs
    breakdown["fours_bonus"] = fours * 4
    breakdown["sixes_bonus"] = sixes * 6

    # Duck
    if dismissed and runs == 0:
        bat -= 2; breakdown["duck"] = -2

    # Milestone (highest only)
    milestone = 16 if runs >= 100 else 12 if runs >= 75 else 8 if runs >= 50 else 4 if runs >= 25 else 0
    bat += milestone
    if milestone: breakdown["milestone"] = milestone

    # Strike rate (min 10 balls faced OR 20 runs scored)
    if balls >= 10 or runs >= 20:
        sr = (runs / balls * 100) if balls > 0 else 0
        sr_pts = (8 if sr > 190 else 6 if sr > 170 else 4 if sr > 150 else
                  2 if sr >= 130 else -6 if sr < 60 else -4 if sr < 70 else
                  -2 if sr <= 100 else 0)
        bat += sr_pts
        breakdown["strike_rate_bonus"] = sr_pts
        breakdown["strike_rate_val"] = round(sr, 1)

    breakdown["batting_total"] = bat
    pts += bat

    # Bowling
    wickets = stats.get("wickets", 0)
    balls_bowled = stats.get("balls_bowled", 0)
    runs_conceded = stats.get("runs_conceded", 0)
    dots = stats.get("dot_balls", 0)
    maidens = stats.get("maidens", 0)
    lbw_bowled = stats.get("lbw_bowled", 0)

    bowl = (dots * 2) + (wickets * 30) + (lbw_bowled * 8) + (maidens * 12)
    breakdown["dots"] = dots * 2
    breakdown["wickets"] = wickets * 30
    breakdown["lbw_bowled_bonus"] = lbw_bowled * 8
    breakdown["maidens"] = maidens * 12

    # Wicket milestone bonus (highest only)
    wkt_bonus = 16 if wickets >= 5 else 12 if wickets >= 4 else 8 if wickets >= 3 else 0
    bowl += wkt_bonus
    if wkt_bonus: breakdown["wicket_haul_bonus"] = wkt_bonus

    # Economy (min 2 overs = 12 balls)
    if balls_bowled >= 12:
        overs = balls_bowled / 6
        eco = runs_conceded / overs
        # Gap at 8.01-9.99 = 0 per scoring rules
        eco_pts = (8 if eco < 5 else 6 if eco < 6 else 4 if eco <= 7 else
                   2 if eco <= 8 else 0 if eco < 10 else -2 if eco <= 11 else
                   -4 if eco <= 12 else -6)
        bowl += eco_pts
        breakdown["economy_bonus"] = eco_pts
        breakdown["economy_val"] = round(eco, 2)

    breakdown["bowling_total"] = bowl
    pts += bowl

    # Fielding — substitute fielders (in_playing_xi=False) get no points at all
    if not stats.get("in_playing_xi"):
        breakdown["fielding_total"] = 0
        breakdown["sub_fielder_note"] = "substitute — no points"
    else:
        catches = stats.get("catches", 0)
        run_outs = stats.get("run_outs", 0)
        stumpings = stats.get("stumpings", 0)

        field = (catches * 8) + (run_outs * 10) + (stumpings * 12)
        if catches >= 3: field += 4; breakdown["three_catch_bonus"] = 4
        breakdown["catches"] = catches * 8
        breakdown["run_outs"] = run_outs * 10
        breakdown["stumpings"] = stumpings * 12
        breakdown["fielding_total"] = field
        pts += field

    return {"total": pts, "breakdown": breakdown}


def apply_multiplier(base_pts: float, role: str) -> float:
    if role == "captain": return base_pts * 2.0
    if role == "vc": return base_pts * 1.5
    return base_pts
