import pytest
from scoring import calculate_fantasy_points, apply_multiplier

def test_duck_penalty_only_when_dismissed():
    # Dismissed duck
    stats = {"runs": 0, "balls_faced": 5, "dismissed": True}
    res = calculate_fantasy_points(stats)
    assert res["breakdown"].get("duck") == -2

    # Not dismissed duck
    stats2 = {"runs": 0, "balls_faced": 5, "dismissed": False}
    res2 = calculate_fantasy_points(stats2)
    assert "duck" not in res2["breakdown"]

def test_strike_rate_eligibility():
    # 10 balls faced (runs < 20) -> eligible, SR = 50 -> -6
    stats1 = {"runs": 5, "balls_faced": 10}
    res1 = calculate_fantasy_points(stats1)
    assert "strike_rate_bonus" in res1["breakdown"]
    assert res1["breakdown"]["strike_rate_bonus"] == -6

    # 20 runs scored (balls < 10) -> eligible, SR = 250 -> +8
    stats2 = {"runs": 20, "balls_faced": 8}
    res2 = calculate_fantasy_points(stats2)
    assert "strike_rate_bonus" in res2["breakdown"]
    assert res2["breakdown"]["strike_rate_bonus"] == 8

    # 9 balls, 15 runs -> NOT eligible
    stats3 = {"runs": 15, "balls_faced": 9}
    res3 = calculate_fantasy_points(stats3)
    assert "strike_rate_bonus" not in res3["breakdown"]

def test_economy_needs_12_balls():
    # 11 balls bowled -> No eco pts
    stats1 = {"balls_bowled": 11, "runs_conceded": 2}
    res1 = calculate_fantasy_points(stats1)
    assert "economy_bonus" not in res1["breakdown"]

    # 12 balls bowled -> eco pts (2 overs, 10 runs -> eco 5.0 -> +6)
    stats2 = {"balls_bowled": 12, "runs_conceded": 10}
    res2 = calculate_fantasy_points(stats2)
    assert "economy_bonus" in res2["breakdown"]
    assert res2["breakdown"]["economy_bonus"] == 6

def test_economy_gap_8_to_10():
    # 12 balls, 16 runs = 8 RPO exactly -> +2
    stats1 = {"balls_bowled": 12, "runs_conceded": 16}
    res1 = calculate_fantasy_points(stats1)
    assert res1["breakdown"]["economy_bonus"] == 2

    # 12 balls, 18 runs = 9 RPO (gap zone 8.01-9.99) -> 0
    stats2 = {"balls_bowled": 12, "runs_conceded": 18}
    res2 = calculate_fantasy_points(stats2)
    assert res2["breakdown"]["economy_bonus"] == 0

    # 12 balls, 20 runs = 10 RPO -> -2
    stats3 = {"balls_bowled": 12, "runs_conceded": 20}
    res3 = calculate_fantasy_points(stats3)
    assert res3["breakdown"]["economy_bonus"] == -2

def test_milestone_is_highest_only():
    # 76 runs = +12 (not cumulative 4+8+12)
    stats = {"runs": 76, "balls_faced": 30}
    res = calculate_fantasy_points(stats)
    assert res["breakdown"]["milestone"] == 12
    # 76 runs, 30 balls -> SR = 253.3 -> +8 SR
    # batting_total = 76 + 12 + 8 = 96
    assert res["breakdown"]["batting_total"] == 96

def test_three_catches_bonus():
    # 3 catches = 3*8 + 4 bonus = 28 pts for fielding
    stats = {"catches": 3}
    res = calculate_fantasy_points(stats)
    assert res["breakdown"]["catches"] == 24
    assert res["breakdown"]["three_catch_bonus"] == 4
    assert res["breakdown"]["fielding_total"] == 28

def test_wicket_haul():
    # 5 wickets = 5*30 + 16 bonus = 166 pts for bowling
    stats = {"wickets": 5}
    res = calculate_fantasy_points(stats)
    assert res["breakdown"]["wickets"] == 150
    assert res["breakdown"]["wicket_haul_bonus"] == 16
    assert res["breakdown"]["bowling_total"] == 166

def test_multiplier():
    assert apply_multiplier(100, "captain") == 200.0
    assert apply_multiplier(100, "vc") == 150.0
    assert apply_multiplier(100, "player") == 100.0

def test_return_type_is_dict():
    res = calculate_fantasy_points({"runs": 50, "balls_faced": 30})
    assert isinstance(res, dict)
    assert "total" in res
    assert "breakdown" in res
