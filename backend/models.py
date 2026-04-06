from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from database import Base
import datetime

class RoleEnum(str, enum.Enum):
    BAT = "BAT"
    BOWL = "BOWL"
    AR = "AR"
    WK = "WK"

class Team(Base):
    __tablename__ = "teams"
    id = Column(Integer, primary_key=True, index=True)
    team_code = Column(String, unique=True, index=True)
    name = Column(String)
    owner_name = Column(String)
    color_hex = Column(String)
    password_env_key = Column(String)
    
    players = relationship("Player", back_populates="team")
    captain_picks = relationship("CaptainPick", back_populates="fantasy_team")

class Player(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    team_id = Column(Integer, ForeignKey("teams.id"))
    ipl_team = Column(String)
    role = Column(Enum(RoleEnum))
    cricketdata_player_id = Column(String, nullable=True)
    
    team = relationship("Team", back_populates="players")

class Match(Base):
    __tablename__ = "matches"
    id = Column(Integer, primary_key=True, index=True)
    ipl_match_id = Column(String, unique=True)
    match_date = Column(DateTime)
    team1 = Column(String)
    team2 = Column(String)
    deadline = Column(DateTime)
    is_completed = Column(Boolean, default=False)
    cricket_live_match_id = Column(Integer, nullable=True)  # Cricket Live Line API match ID
    
    match_scores = relationship("MatchScore", back_populates="match")
    captain_picks = relationship("CaptainPick", back_populates="match")

class CaptainPick(Base):
    __tablename__ = "captain_picks"
    id = Column(Integer, primary_key=True, index=True)
    fantasy_team_id = Column(Integer, ForeignKey("teams.id"))
    match_id = Column(Integer, ForeignKey("matches.id"))
    captain_player_id = Column(Integer, ForeignKey("players.id"))
    vc_player_id = Column(Integer, ForeignKey("players.id"))
    submitted_at = Column(DateTime, default=datetime.datetime.utcnow)
    is_locked = Column(Boolean, default=False)
    
    fantasy_team = relationship("Team", back_populates="captain_picks")
    match = relationship("Match", back_populates="captain_picks")

class MatchScore(Base):
    __tablename__ = "match_scores"
    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"))
    match_id = Column(Integer, ForeignKey("matches.id"))
    runs = Column(Integer, default=0)
    fours = Column(Integer, default=0)
    sixes = Column(Integer, default=0)
    balls_faced = Column(Integer, default=0)
    dismissed = Column(Boolean, default=False)
    wickets = Column(Integer, default=0)
    dot_balls = Column(Integer, default=0)
    lbw_bowled = Column(Integer, default=0)
    maidens = Column(Integer, default=0)
    balls_bowled = Column(Integer, default=0)
    runs_conceded = Column(Integer, default=0)
    catches = Column(Integer, default=0)
    run_outs = Column(Integer, default=0)
    stumpings = Column(Integer, default=0)
    fantasy_points_base = Column(Float, default=0.0)
    fantasy_points_final = Column(Float, default=0.0)
    manual_points = Column(Float, default=0.0)
    stats_json = Column(String, default="{}")
    breakdown_json = Column(String, default="{}")
    
    match = relationship("Match", back_populates="match_scores")
    player = relationship("Player")
