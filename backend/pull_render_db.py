"""
pull_render_db.py
-----------------
Pulls all data from the Render PostgreSQL database and writes it into the
local SQLite file (ipl_fantasy.db).  Run once before local testing.

Usage:
    python pull_render_db.py --render-url "postgresql://user:pass@host/db"

Or set RENDER_DB_URL in your .env and just run:
    python pull_render_db.py
"""

import os, sys, argparse, json
from dotenv import load_dotenv

load_dotenv()


def get_pg_engine(url: str):
    from sqlalchemy import create_engine
    # Render gives postgres:// or postgresql:// — normalise to psycopg3 driver
    url = url.replace("postgres://", "postgresql+psycopg://", 1)
    url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True)


def get_sqlite_engine():
    from sqlalchemy import create_engine
    return create_engine("sqlite:///./ipl_fantasy.db", connect_args={"check_same_thread": False})


def pull(render_url: str):
    from sqlalchemy import text

    print("Connecting to Render PostgreSQL...")
    pg  = get_pg_engine(render_url)
    sq  = get_sqlite_engine()

    # Make sure SQLite schema exists
    import models
    from database import Base
    Base.metadata.create_all(bind=sq)

    tables = ["teams", "players", "matches", "captain_picks", "match_scores"]

    with pg.connect() as pg_conn, sq.connect() as sq_conn:
        sq_conn.execute(text("PRAGMA foreign_keys = OFF"))

        for table in tables:
            print(f"  Copying {table}...", end=" ", flush=True)

            # Fetch all rows from Postgres
            rows = pg_conn.execute(text(f"SELECT * FROM {table}")).mappings().all()

            if not rows:
                print("0 rows")
                continue

            # Clear existing SQLite data for this table
            sq_conn.execute(text(f"DELETE FROM {table}"))

            # Insert in batches
            cols = list(rows[0].keys())
            col_list  = ", ".join(cols)
            val_list  = ", ".join(f":{c}" for c in cols)
            insert_sql = text(f"INSERT INTO {table} ({col_list}) VALUES ({val_list})")

            batch = [dict(r) for r in rows]
            sq_conn.execute(insert_sql, batch)
            print(f"{len(rows)} rows")

        sq_conn.execute(text("PRAGMA foreign_keys = ON"))
        sq_conn.commit()

    print("\nDone! Local ipl_fantasy.db is now a copy of the Render database.")
    print("Start the backend normally:  uvicorn main:app --reload")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--render-url", default=os.getenv("RENDER_DB_URL", ""))
    args = parser.parse_args()

    if not args.render_url:
        print("ERROR: Provide --render-url or set RENDER_DB_URL in .env")
        sys.exit(1)

    pull(args.render_url)
