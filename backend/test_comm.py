"""Check cricketdata.org scorecard format: python test_comm.py"""
import requests, json, os
from dotenv import load_dotenv
from database import SessionLocal
import models

load_dotenv()
KEY = os.getenv("CRICKETDATA_API_KEY", "")
BASE = "https://api.cricapi.com/v1"

db = SessionLocal()
match = db.query(models.Match).filter_by(is_completed=True).first()
db.close()

print(f"Match: {match.team1} vs {match.team2}  ipl_match_id={match.ipl_match_id}")

resp = requests.get(f"{BASE}/match_scorecard", params={"apikey": KEY, "id": match.ipl_match_id}, timeout=15)
data = resp.json()
print(f"Status: {data.get('status')}  info: {data.get('info','')}")

if data.get("status") == "success":
    d = data["data"]
    print(f"\nTop keys: {list(d.keys())}")
    # Show batting sample
    batting = d.get("batting") or d.get("scorecard", [{}])[0].get("batting") if d.get("scorecard") else []
    bowling = d.get("bowling") or d.get("scorecard", [{}])[0].get("bowling") if d.get("scorecard") else []
    print(f"\nBatting sample (first entry):\n{json.dumps(batting[0] if batting else {}, indent=2)}")
    print(f"\nBowling sample (first entry):\n{json.dumps(bowling[0] if bowling else {}, indent=2)}")
    if d.get("scorecard"):
        print(f"\nScorecard innings count: {len(d['scorecard'])}")
        print(f"Innings[0] keys: {list(d['scorecard'][0].keys())}")
