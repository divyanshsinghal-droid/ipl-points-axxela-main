"""
Check and fix missing/wrong players in DB.
Run: python fix_players.py
"""
import sys
from database import SessionLocal
import models

db = SessionLocal()

# ── 1. Search for David Payne ─────────────────────────────────────────────────
print("=== Searching for 'Payne' or 'David' in DB ===")
players = db.query(models.Player).all()
for p in players:
    if "payne" in p.name.lower() or ("david" in p.name.lower() and "tim" not in p.name.lower()):
        print(f"  Found: id={p.id}  name={p.name}  team={p.ipl_team}  role={p.role}")

# ── 2. Search for Abhinandan Singh ───────────────────────────────────────────
print("\n=== Searching for 'Abhinandan' or 'Singh' in DB ===")
for p in players:
    if "abhinandan" in p.name.lower():
        print(f"  Found: id={p.id}  name={p.name}  team={p.ipl_team}  role={p.role}")

print("\n=== All SRH players in DB ===")
for p in players:
    if p.ipl_team and "sunrisers" in p.ipl_team.lower():
        print(f"  id={p.id}  name={p.name}  role={p.role}")

db.close()
