"""
Replace an injured player with their IPL replacement in the fantasy DB.
Harshit Rana → Navdeep Saini

- Finds Harshit Rana's fantasy team and role
- Creates Navdeep Saini in the same fantasy team with the same role
- Removes Harshit Rana from the DB

Run: python replace_player.py
"""
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import models
from database import Base

OUT_PLAYER = "Harshit Rana"
IN_PLAYER  = "Navdeep Saini"
IN_IPL_TEAM = "Kolkata Knight Riders"

def replace(engine, label):
    Session = sessionmaker(bind=engine)
    db = Session()

    out = db.query(models.Player).filter_by(name=OUT_PLAYER).first()
    if not out:
        print(f"  {label}: '{OUT_PLAYER}' not found — skipping")
        db.close()
        return

    # Check if replacement already exists
    existing = db.query(models.Player).filter_by(name=IN_PLAYER).first()
    if existing:
        print(f"  {label}: '{IN_PLAYER}' already exists (id={existing.id}) — skipping creation")
    else:
        new_player = models.Player(
            name=IN_PLAYER,
            team_id=out.team_id,
            ipl_team=IN_IPL_TEAM,
            role=out.role,
        )
        db.add(new_player)
        db.flush()
        print(f"  {label}: Created '{IN_PLAYER}' (id={new_player.id}) in fantasy team id={out.team_id}, role={out.role}")

    # Nullify captain/vc references before deleting
    db.query(models.CaptainPick).filter_by(captain_player_id=out.id).update({"captain_player_id": None})
    db.query(models.CaptainPick).filter_by(vc_player_id=out.id).update({"vc_player_id": None})
    # Delete match scores for this player
    db.query(models.MatchScore).filter_by(player_id=out.id).delete()
    db.delete(out)
    db.commit()
    print(f"  {label}: Removed '{OUT_PLAYER}'")
    db.close()

# SQLite
sqlite_engine = create_engine("sqlite:///./ipl_fantasy.db", connect_args={"check_same_thread": False})
replace(sqlite_engine, "SQLite")

# PostgreSQL
DEST_DB = os.getenv("DEST_DATABASE_URL", "")
if DEST_DB:
    if DEST_DB.startswith("postgres://"):
        DEST_DB = DEST_DB.replace("postgres://", "postgresql+psycopg://", 1)
    elif DEST_DB.startswith("postgresql://"):
        DEST_DB = DEST_DB.replace("postgresql://", "postgresql+psycopg://", 1)
    pg_engine = create_engine(DEST_DB, pool_pre_ping=True)
    replace(pg_engine, "PostgreSQL")
else:
    print("  INFO: Skipping PostgreSQL (DEST_DATABASE_URL not set)")

print("Done!")
