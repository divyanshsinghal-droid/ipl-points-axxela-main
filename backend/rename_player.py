"""
Rename 'Digvesh Rathi' to 'Digvesh Singh Rathi' in SQLite and PostgreSQL.
Run: python rename_player.py
"""
import os
from sqlalchemy import create_engine, text

OLD_NAME = "Digvesh Rathi"
NEW_NAME = "Digvesh Singh Rathi"

def rename(engine, label):
    with engine.connect() as conn:
        result = conn.execute(
            text("UPDATE players SET name = :new WHERE name = :old"),
            {"new": NEW_NAME, "old": OLD_NAME}
        )
        conn.commit()
        print(f"{label}: {result.rowcount} row(s) updated")

# SQLite
sqlite_engine = create_engine("sqlite:///./ipl_fantasy.db", connect_args={"check_same_thread": False})
rename(sqlite_engine, "SQLite")

# PostgreSQL
DEST_DB = os.getenv("DEST_DATABASE_URL", "")
if DEST_DB:
    if DEST_DB.startswith("postgres://"):
        DEST_DB = DEST_DB.replace("postgres://", "postgresql+psycopg://", 1)
    elif DEST_DB.startswith("postgresql://"):
        DEST_DB = DEST_DB.replace("postgresql://", "postgresql+psycopg://", 1)
    pg_engine = create_engine(DEST_DB, pool_pre_ping=True)
    rename(pg_engine, "PostgreSQL")
else:
    print("INFO: Skipping PostgreSQL (DEST_DATABASE_URL not set)")

print("Done!")
