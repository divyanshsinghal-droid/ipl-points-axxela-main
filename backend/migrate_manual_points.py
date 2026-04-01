"""Add manual_points column to match_scores. Run once: python migrate_manual_points.py"""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    for sql in [
        "ALTER TABLE match_scores ADD COLUMN manual_points REAL DEFAULT 0.0",
    ]:
        try:
            conn.execute(text(sql))
            conn.commit()
            print(f"OK: {sql}")
        except Exception as e:
            if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                print(f"Already exists — skipping.")
            else:
                raise
