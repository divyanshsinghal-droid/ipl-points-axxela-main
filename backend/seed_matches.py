import datetime
from database import SessionLocal
import models

def seed_matches():
    db = SessionLocal()
    try:
        if db.query(models.Match).count() == 0:
            m1 = models.Match(
                ipl_match_id="mock_completed_1",
                match_date=datetime.datetime.utcnow() - datetime.timedelta(days=1),
                team1="MI",
                team2="CSK",
                deadline=datetime.datetime.utcnow() - datetime.timedelta(days=1, hours=1),
                is_completed=True
            )
            m2 = models.Match(
                ipl_match_id="mock_active_1",
                match_date=datetime.datetime.utcnow() + datetime.timedelta(hours=2),
                team1="RCB",
                team2="KKR",
                deadline=datetime.datetime.utcnow() + datetime.timedelta(hours=1, minutes=30),
                is_completed=False
            )
            db.add(m1)
            db.add(m2)
            db.commit()
            print("Successfully seeded mock matches.")
        else:
            print("Matches already exist.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_matches()
