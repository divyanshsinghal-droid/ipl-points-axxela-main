"""
Migrate data from local SQLite → Render PostgreSQL.

Usage:
  1. Set DEST_DB to your Render PostgreSQL internal URL
  2. Run: python migrate_to_postgres.py
"""
import os, sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

SQLITE_URL = "sqlite:///./ipl_fantasy.db"
DEST_DB    = os.getenv("DEST_DATABASE_URL", "")  # set this before running

if not DEST_DB:
    print("ERROR: Set DEST_DATABASE_URL env var to your Render PostgreSQL URL")
    print("  Example: set DEST_DATABASE_URL=postgresql://user:pass@host/dbname")
    sys.exit(1)

if DEST_DB.startswith("postgres://"):
    DEST_DB = DEST_DB.replace("postgres://", "postgresql+psycopg://", 1)
elif DEST_DB.startswith("postgresql://"):
    DEST_DB = DEST_DB.replace("postgresql://", "postgresql+psycopg://", 1)

src_engine  = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
dest_engine = create_engine(DEST_DB, pool_pre_ping=True)

# Create all tables on destination
from database import Base
import models
Base.metadata.create_all(bind=dest_engine)

SrcSession  = sessionmaker(bind=src_engine)
DestSession = sessionmaker(bind=dest_engine)

src  = SrcSession()
dest = DestSession()

TABLES = [
    (models.Team,         "teams"),
    (models.Player,       "players"),
    (models.Match,        "matches"),
    (models.CaptainPick,  "captain_picks"),
    (models.MatchScore,   "match_scores"),
]

for Model, label in TABLES:
    rows = src.query(Model).all()
    dest.query(Model).delete()
    dest.commit()
    for row in rows:
        dest.merge(row)
    dest.commit()
    print(f"  ✓ {label}: {len(rows)} rows")

src.close()
dest.close()
print("\nMigration complete!")
