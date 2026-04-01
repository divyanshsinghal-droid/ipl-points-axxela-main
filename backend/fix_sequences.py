"""
Fix PostgreSQL sequences after migration.
Run this once after migrate_to_postgres.py

Usage (PowerShell):
  $env:DEST_DATABASE_URL="postgresql://..."
  python fix_sequences.py
"""
import os, sys
from sqlalchemy import create_engine, text

DEST_DB = os.getenv("DEST_DATABASE_URL", "")
if not DEST_DB:
    print("ERROR: Set DEST_DATABASE_URL env var")
    sys.exit(1)

if DEST_DB.startswith("postgres://"):
    DEST_DB = DEST_DB.replace("postgres://", "postgresql+psycopg://", 1)
elif DEST_DB.startswith("postgresql://"):
    DEST_DB = DEST_DB.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DEST_DB, pool_pre_ping=True)

TABLES = ["teams", "players", "matches", "captain_picks", "match_scores"]

with engine.connect() as conn:
    for table in TABLES:
        conn.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
        ))
        print(f"  ✓ {table} sequence reset")
    conn.commit()

print("\nSequences fixed!")
