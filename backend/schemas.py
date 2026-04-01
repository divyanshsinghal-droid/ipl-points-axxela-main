from pydantic import BaseModel
from typing import List, Optional

class TeamLogin(BaseModel):
    team_code: str
    password: str

class AdminLogin(BaseModel):
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TeamResponse(BaseModel):
    id: int
    team_code: str
    name: str
    owner_name: str
    color_hex: str
    model_config = {"from_attributes": True}

class PlayerResponse(BaseModel):
    id: int
    name: str
    team_id: int
    ipl_team: str
    role: str
    cricketdata_player_id: Optional[str] = None
    last_8_scores: List[int] = []
    avg_pts: float = 0.0
    model_config = {"from_attributes": True}

class MatchResponse(BaseModel):
    id: int
    ipl_match_id: str
    team1: str
    team2: str
    match_date: str
    deadline: str
    is_completed: bool
    model_config = {"from_attributes": True}

class PickSubmit(BaseModel):
    match_id: int
    captain_player_id: int
    vc_player_id: int

class PickResponse(BaseModel):
    id: int
    fantasy_team_id: int
    match_id: int
    captain_player_id: int
    vc_player_id: int
    is_locked: bool
    model_config = {"from_attributes": True}

class LeaderboardTeamResponse(BaseModel):
    rank: int
    id: int
    team_code: str
    name: str
    owner_name: str
    color_hex: str
    total_pts: float
    avg_pts: float
    base_pts: float = 0.0
    matches_count: int = 0
    recent_form: List[float]

class LeaderboardPlayerResponse(BaseModel):
    rank: int
    id: int
    name: str
    role: str
    ipl_team: str
    fantasy_team: str
    runs: int
    wickets: int
    c_multiplier_count: int
    vc_multiplier_count: int
    total_pts: float
    avg_pts: float
    sparkline: List[float] = []
    highest_score: float = 0.0


class PlayerUpsert(BaseModel):
    id: Optional[int] = None
    name: str
    team_id: int
    ipl_team: str
    role: str
    cricketdata_player_id: Optional[str] = None
