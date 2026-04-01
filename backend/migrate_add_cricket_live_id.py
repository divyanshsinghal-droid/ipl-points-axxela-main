"""Add cricket_live_match_id column to matches table. Run once: python migrate_add_cricket_live_id.py"""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE matches ADD COLUMN cricket_live_match_id INTEGER"))
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print("Column already exists — nothing to do.")
        else:
            raise
