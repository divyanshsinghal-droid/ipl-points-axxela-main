"""
Update ipl_team for all players in both SQLite and PostgreSQL.
Run: python update_ipl_teams.py
"""
import os, sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import models
from database import Base

PLAYER_TEAMS = {
    "Akshat Raghuwanshi": "Lucknow Super Giants",
    "M Shahrukh Khan": "Gujarat Titans",
    "Virat Kohli": "Royal Challengers Bengaluru",
    "Marcus Stoinis": "Punjab Kings",
    "Noor Ahmad": "Chennai Super Kings",
    "Rohit Sharma": "Mumbai Indians",
    "Manimaran Siddharth": "Lucknow Super Giants",
    "Kagiso Rabada": "Gujarat Titans",
    "Ravichandran Smaran": "Sunrisers Hyderabad",
    "Digvesh Rathi": "Lucknow Super Giants",
    "Urvil Patel": "Chennai Super Kings",
    "Tushar Deshpande": "Rajasthan Royals",
    "Dushmantha Chameera": "Delhi Capitals",
    "AM Ghazanfar": "Mumbai Indians",
    "Anukul Roy": "Kolkata Knight Riders",
    "Travis Head": "Sunrisers Hyderabad",
    "Jos Buttler": "Gujarat Titans",
    "Mitchell Starc": "Delhi Capitals",
    "Kuldeep Yadav": "Delhi Capitals",
    "Cooper Connolly": "Punjab Kings",
    "T Natarajan": "Delhi Capitals",
    "Jacob Bethell": "Royal Challengers Bengaluru",
    "Wanindu Hasaranga": "Lucknow Super Giants",
    "Jason Holder": "Gujarat Titans",
    "Yuzvendra Chahal": "Punjab Kings",
    "Matthew Breetzke": "Lucknow Super Giants",
    "Yash Thakur": "Punjab Kings",
    "Matheesha Pathirana": "Kolkata Knight Riders",
    "Kartik Sharma": "Chennai Super Kings",
    "Yashasvi Jaiswal": "Rajasthan Royals",
    "Krunal Pandya": "Royal Challengers Bengaluru",
    "Arshdeep Singh": "Punjab Kings",
    "Nicholas Pooran": "Lucknow Super Giants",
    "Vipraj Nigam": "Delhi Capitals",
    "Vaibhav Sooryavanshi": "Rajasthan Royals",
    "Kuldeep Sen": "Rajasthan Royals",
    "Ashwani Kumar": "Mumbai Indians",
    "Ishant Sharma": "Gujarat Titans",
    "Kamindu Mendis": "Sunrisers Hyderabad",
    "Josh Inglis": "Lucknow Super Giants",
    "Prashant Veer": "Chennai Super Kings",
    "Deepak Chahar": "Mumbai Indians",
    "Washington Sundar": "Gujarat Titans",
    "Nehal Wadhera": "Punjab Kings",
    "Umran Malik": "Kolkata Knight Riders",
    "Matthew Short": "Chennai Super Kings",
    "Sunil Narine": "Kolkata Knight Riders",
    "Dewald Brevis": "Chennai Super Kings",
    "Priyansh Arya": "Punjab Kings",
    "Shashank Singh": "Punjab Kings",
    "Axar Patel": "Delhi Capitals",
    "Anrich Nortje": "Lucknow Super Giants",
    "Ayush Badoni": "Lucknow Super Giants",
    "Venkatesh Iyer": "Royal Challengers Bengaluru",
    "Sai Kishore": "Gujarat Titans",
    "Rahul Chahar": "Chennai Super Kings",
    "Prithvi Shaw": "Delhi Capitals",
    "Lhuan-dre Pretorius": "Rajasthan Royals",
    "Shardul Thakur": "Mumbai Indians",
    "Jacob Duffy": "Royal Challengers Bengaluru",
    "Varun Chakravarthy": "Kolkata Knight Riders",
    "Finn Allen": "Kolkata Knight Riders",
    "Aniket Verma": "Sunrisers Hyderabad",
    "Shivang Kumar": "Sunrisers Hyderabad",
    "Musheer Khan": "Punjab Kings",
    "Yash Dayal": "Royal Challengers Bengaluru",
    "Anuj Rawat": "Gujarat Titans",
    "Kumar Kushagra": "Gujarat Titans",
    "Abishek Porel": "Delhi Capitals",
    "Sameer Rizvi": "Delhi Capitals",
    "Mukesh Choudhary": "Chennai Super Kings",
    "Arjun Tendulkar": "Lucknow Super Giants",
    "Shimron Hetmyer": "Rajasthan Royals",
    "Ravindra Jadeja": "Rajasthan Royals",
    "Heinrich Klaasen": "Sunrisers Hyderabad",
    "Hardik Pandya": "Mumbai Indians",
    "Suryakumar Yadav": "Mumbai Indians",
    "Harshal Patel": "Sunrisers Hyderabad",
    "Cameron Green": "Kolkata Knight Riders",
    "Rashid Khan": "Gujarat Titans",
    "Josh Hazlewood": "Royal Challengers Bengaluru",
    "MS Dhoni": "Chennai Super Kings",
    "Auqib Nabi": "Delhi Capitals",
    "Xavier Bartlett": "Punjab Kings",
    "Avesh Khan": "Lucknow Super Giants",
    "Mayank Markande": "Mumbai Indians",
    "Ajinkya Rahane": "Kolkata Knight Riders",
    "Jofra Archer": "Rajasthan Royals",
    "Ravi Bishnoi": "Rajasthan Royals",
    "Ayush Mhatre": "Chennai Super Kings",
    "Manish Pandey": "Kolkata Knight Riders",
    "Romario Shepherd": "Royal Challengers Bengaluru",
    "Tim David": "Royal Challengers Bengaluru",
    "Eshan Malinga": "Sunrisers Hyderabad",
    "Ishan Kishan": "Sunrisers Hyderabad",
    "Marco Jansen": "Punjab Kings",
    "Prasidh Krishna": "Gujarat Titans",
    "Glenn Phillips": "Gujarat Titans",
    "Mayank Yadav": "Lucknow Super Giants",
    "Abhishek Sharma": "Sunrisers Hyderabad",
    "Rovman Powell": "Kolkata Knight Riders",
    "Nitish Rana": "Delhi Capitals",
    "Liam Livingstone": "Sunrisers Hyderabad",
    "Kyle Jamieson": "Delhi Capitals",
    "Rahul Tripathi": "Kolkata Knight Riders",
    "Shubham Dubey": "Rajasthan Royals",
    "Ramandeep Singh": "Kolkata Knight Riders",
    "Nandre Burger": "Rajasthan Royals",
    "Khaleel Ahmed": "Chennai Super Kings",
    "Naman Dhir": "Mumbai Indians",
    "Phil Salt": "Royal Challengers Bengaluru",
    "Shreyas Iyer": "Punjab Kings",
    "Aiden Markram": "Lucknow Super Giants",
    "Rishabh Pant": "Lucknow Super Giants",
    "Donovan Ferreira": "Rajasthan Royals",
    "Mangesh Yadav": "Royal Challengers Bengaluru",
    "Lungi Ngidi": "Delhi Capitals",
    "Arshad Khan": "Gujarat Titans",
    "Quinton de Kock": "Mumbai Indians",
    "Spencer Johnson": "Chennai Super Kings",
    "Shahbaz Ahmed": "Lucknow Super Giants",
    "Vijaykumar Vyshak": "Punjab Kings",
    "Zeeshan Ansari": "Sunrisers Hyderabad",
    "Jaydev Unadkat": "Sunrisers Hyderabad",
    "Sanju Samson": "Chennai Super Kings",
    "Anshul Kamboj": "Chennai Super Kings",
    "Rinku Singh": "Kolkata Knight Riders",
    "Rachin Ravindra": "Kolkata Knight Riders",
    "Mitchell Marsh": "Lucknow Super Giants",
    "KL Rahul": "Delhi Capitals",
    "Pat Cummins": "Sunrisers Hyderabad",
    "Mohammed Siraj": "Gujarat Titans",
    "Jasprit Bumrah": "Mumbai Indians",
    "Vignesh Puthur": "Rajasthan Royals",
    "Akeal Hosein": "Chennai Super Kings",
    "Corbin Bosch": "Mumbai Indians",
    "Mitchell Santner": "Mumbai Indians",
    "Vishnu Vinod": "Punjab Kings",
    "Azmatullah Omarzai": "Punjab Kings",
    "Karun Nair": "Delhi Capitals",
    "Mohammed Shami": "Lucknow Super Giants",
    "Bhuvneshwar Kumar": "Royal Challengers Bengaluru",
    "Jamie Overton": "Chennai Super Kings",
    "Prabhsimran Singh": "Punjab Kings",
    "Harshit Rana": "Kolkata Knight Riders",
    "Tristan Stubbs": "Delhi Capitals",
    "Dasun Shanaka": "Rajasthan Royals",
    "Rahul Tewatia": "Gujarat Titans",
    "Harpreet Brar": "Punjab Kings",
    "Pathum Nissanka": "Delhi Capitals",
    "Matt Henry": "Chennai Super Kings",
    "Rajat Patidar": "Royal Challengers Bengaluru",
    "Dhruv Jurel": "Rajasthan Royals",
    "Jitesh Sharma": "Royal Challengers Bengaluru",
    "Salil Arora": "Sunrisers Hyderabad",
    "Sarfaraz Khan": "Chennai Super Kings",
    "Suyash Sharma": "Royal Challengers Bengaluru",
    "Harsh Dubey": "Sunrisers Hyderabad",
    "Angkrish Raghuvanshi": "Kolkata Knight Riders",
    "Mitchell Owen": "Punjab Kings",
    "Shubman Gill": "Gujarat Titans",
    "Rasikh Salam": "Royal Challengers Bengaluru",
    "Abdul Samad": "Lucknow Super Giants",
    "Will Jacks": "Mumbai Indians",
    "Sandeep Sharma": "Rajasthan Royals",
    "Shivam Mavi": "Sunrisers Hyderabad",
    "Mayank Rawat": "Mumbai Indians",
    "Tilak Varma": "Mumbai Indians",
    "Harnoor Singh": "Punjab Kings",
    "Tom Banton": "Gujarat Titans",
    "David Miller": "Delhi Capitals",
    "Ashutosh Sharma": "Delhi Capitals",
    "Kartik Tyagi": "Kolkata Knight Riders",
    "Shivam Dube": "Chennai Super Kings",
    "Vaibhav Arora": "Kolkata Knight Riders",
    "Sai Sudharsan": "Gujarat Titans",
    "Mukesh Kumar": "Delhi Capitals",
    "Tim Seifert": "Kolkata Knight Riders",
    "Ben Duckett": "Delhi Capitals",
    "Riyan Parag": "Rajasthan Royals",
    "Tejasvi Dahiya": "Kolkata Knight Riders",
    "Prince Yadav": "Lucknow Super Giants",
    "Lockie Ferguson": "Punjab Kings",
    "Trent Boult": "Mumbai Indians",
    "Mohsin Khan": "Lucknow Super Giants",
    "Nitish Kumar Reddy": "Sunrisers Hyderabad",
    "Devdutt Padikkal": "Royal Challengers Bengaluru",
    "Ruturaj Gaikwad": "Chennai Super Kings",
    "Blessing Muzarabani": "Kolkata Knight Riders",
    "Ryan Rickelton": "Mumbai Indians",
    "Sherfane Rutherford": "Mumbai Indians",
}

def update_db(engine, label):
    Session = sessionmaker(bind=engine)
    db = Session()
    updated = 0
    not_found = []
    for name, team in PLAYER_TEAMS.items():
        player = db.query(models.Player).filter_by(name=name).first()
        if player:
            player.ipl_team = team
            updated += 1
        else:
            not_found.append(name)
    db.commit()
    db.close()
    print(f"  OK {label}: {updated} players updated")
    if not_found:
        print(f"  MISSING in {label}: {', '.join(not_found)}")

# Update SQLite
sqlite_engine = create_engine("sqlite:///./ipl_fantasy.db", connect_args={"check_same_thread": False})
update_db(sqlite_engine, "SQLite")

# Update PostgreSQL if provided
DEST_DB = os.getenv("DEST_DATABASE_URL", "")
if DEST_DB:
    if DEST_DB.startswith("postgres://"):
        DEST_DB = DEST_DB.replace("postgres://", "postgresql+psycopg://", 1)
    elif DEST_DB.startswith("postgresql://"):
        DEST_DB = DEST_DB.replace("postgresql://", "postgresql+psycopg://", 1)
    pg_engine = create_engine(DEST_DB, pool_pre_ping=True)
    update_db(pg_engine, "PostgreSQL")
else:
    print("  INFO: Skipping PostgreSQL (DEST_DATABASE_URL not set)")

print("\nDone!")
