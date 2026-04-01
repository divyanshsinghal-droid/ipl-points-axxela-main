import os
from database import SessionLocal, engine, Base
import models
from dotenv import load_dotenv

load_dotenv()

DEMO_TEAMS = [
    {"team_code": f"team_{i:02d}", "name": f"Team {i}", "owner_name": f"Owner {i}", "color_hex": "#F59E0B", "password_env_key": f"TEAM_PASSWORD_{i:02d}"}
    for i in range(1, 13)
]

ROLES = [models.RoleEnum.BAT]*4 + [models.RoleEnum.BOWL]*4 + [models.RoleEnum.AR]*3 + [models.RoleEnum.WK]*1

def seed_db():
    print("Recreating database tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    print("Seeding 12 teams and placeholders...")
    
    try:
        for t_idx, t_data in enumerate(DEMO_TEAMS, 1):
            team = models.Team(
                team_code=t_data["team_code"],
                name=t_data["name"],
                owner_name=t_data["owner_name"],
                color_hex=t_data["color_hex"],
                password_env_key=t_data["password_env_key"]
            )
            db.add(team)
            db.commit()
            db.refresh(team)
            
            for p_idx in range(1, 13):
                role = ROLES[p_idx - 1]
                player = models.Player(
                    name=f"Player {p_idx} ({role.value})",
                    team_id=team.id,
                    ipl_team="TBA",
                    role=role
                )
                db.add(player)
            db.commit()
            
        print("Seeding complete! 12 teams and 144 players inserted.")
    except Exception as e:
        print(f"Error seeding DB: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_db()
