import os, requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("CRICKETDATA_API_KEY")
print(f"Using API KEY: {API_KEY}")

res = requests.get(f"https://api.cricketdata.org/api/v1/matches?apikey={API_KEY}&offset=0")
data = res.json().get("data", [])
print(f"Total raw matches fetched: {len(data)}")
for i, m in enumerate(data[:30]):
    print(f"[{i}] Name: {m.get('name', '')} | Series: {m.get('series', '')} | ID: {m.get('id', '')}")
