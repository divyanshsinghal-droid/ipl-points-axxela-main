import os
from sqlalchemy.orm import Session
from database import engine, SessionLocal, Base
import models


data_blob = """
Averaging Addicts
Anukul Roy
Akshat Raghuwanshi
Rohit Sharma
M Shahrukh Khan
Marcus Stoinis
AM Ghazanfar
Manimaran Siddharth
Kagiso Rabada
Ravichandran Smaran
Digvesh Rathi
Noor Ahmad
Urvil Patel
Tushar Deshpande
Dushmantha Chameera
Travis Head
Virat Kohli

Babita blasters
Jos Buttler
Yashasvi Jaiswal
Mitchell Starc
Kuldeep Yadav
Cooper Connolly
Kartik Sharma
T Natarajan
Jacob Bethell
Wanindu Hasaranga
Jason Holder
Yuzvendra Chahal
Matthew Breetzke
Yash Thakur
Matheesha Pathirana
Krunal Pandya

Badshahs
Sunil Narine
Arshdeep Singh
Nicholas Pooran
Vaibhav Sooryavanshi
Vipraj Nigam
Matthew Short
Kuldeep Sen
Ashwani Kumar
Ishant Sharma
Kamindu Mendis
Josh Inglis
Prashant Veer
Deepak Chahar
Washington Sundar
Nehal Wadhera
Umran Malik

BJP
Varun Chakravarthy
Dewald Brevis
Priyansh Arya
Shashank Singh
Axar Patel
Anrich Nortje
Ayush Badoni
Finn Allen
Venkatesh Iyer
Shardul Thakur
Sai Kishore
Rahul Chahar
Prithvi Shaw
Lhuan-dre Pretorius
Jacob Duffy
Aniket Verma

Doji star(Kishan sharma)
Shivang Kumar
Hardik Pandya
Shimron Hetmyer
Suryakumar Yadav
Ravindra Jadeja
Cameron Green
Musheer Khan
Yash Dayal
Anuj Rawat
Kumar Kushagra
Abishek Porel
Sameer Rizvi
Mukesh Choudhary
Arjun Tendulkar
Harshal Patel
Heinrich Klaasen

Duck Army
Manish Pandey
Rashid Khan
Ajinkya Rahane
Josh Hazlewood
MS Dhoni
Jofra Archer
Auqib Nabi
Xavier Bartlett
Ravi Bishnoi
Ayush Mhatre
Avesh Khan
Mayank Markande
Ishan Kishan
Romario Shepherd
Tim David
Eshan Malinga

Emperors
Naman Dhir
Marco Jansen
Prasidh Krishna
Glenn Phillips
Mayank Yadav
Khaleel Ahmed
Nandre Burger
Rovman Powell
Nitish Rana
Ramandeep Singh
Liam Livingstone
Kyle Jamieson
Rahul Tripathi
Shubham Dubey
Phil Salt
Abhishek Sharma

Fed Fixers
Shreyas Iyer
Aiden Markram
Sanju Samson
Rishabh Pant
Rinku Singh
Donovan Ferreira
Mangesh Yadav
Lungi Ngidi
Anshul Kamboj
Arshad Khan
Quinton de Kock
Spencer Johnson
Shahbaz Ahmed
Vijaykumar Vyshak
Zeeshan Ansari
Jaydev Unadkat

JAINWIN
Rachin Ravindra
Jasprit Bumrah
Mitchell Marsh
KL Rahul
Pat Cummins
Mohammed Siraj
Vignesh Puthur
Akeal Hosein
Corbin Bosch
Mitchell Santner
Vishnu Vinod
Jamie Overton
Azmatullah Omarzai
Karun Nair
Mohammed Shami
Bhuvneshwar Kumar

ronak's Team
Dhruv Jurel
Angkrish Raghuvanshi
Prabhsimran Singh
Harshit Rana
Tristan Stubbs
Dasun Shanaka
Matt Henry
Rahul Tewatia
Harpreet Brar
Sarfaraz Khan
Pathum Nissanka
Rajat Patidar
Harsh Dubey
Jitesh Sharma
Salil Arora
Suyash Sharma

Shooting stars
Mitchell Owen
Tilak Varma
Shubman Gill
Shivam Dube
Rasikh Salam
Abdul Samad
Will Jacks
Shivam Mavi
Mayank Rawat
Kartik Tyagi
Harnoor Singh
Tom Banton
David Miller
Vaibhav Arora
Sandeep Sharma
Ashutosh Sharma

Team Suket
Ryan Rickelton
Sai Sudharsan
Sherfane Rutherford
Ruturaj Gaikwad
Riyan Parag
Mukesh Kumar
Trent Boult
Tim Seifert
Ben Duckett
Tejasvi Dahiya
Prince Yadav
Lockie Ferguson
Mohsin Khan
Blessing Muzarabani
Nitish Kumar Reddy
Devdutt Padikkal
"""

team_names = [
    "Averaging Addicts", "Babita blasters", "Badshahs", "BJP", "Doji star(Kishan sharma)", "Duck Army",
    "Emperors", "Fed Fixers", "JAINWIN", "ronak's Team", "Shooting stars", "Team Suket"
]

owner_names = {
    "Averaging Addicts": "Averaging Addicts",
    "Babita blasters": "Babita",
    "Badshahs": "Badshahs",
    "BJP": "BJP",
    "Doji star(Kishan sharma)": "Kishan Sharma",
    "Duck Army": "Duck Army",
    "Emperors": "Emperors",
    "Fed Fixers": "Fed Fixers",
    "JAINWIN": "JAINWIN",
    "ronak's Team": "Ronak",
    "Shooting stars": "Shooting Stars",
    "Team Suket": "Suket",
}

colors = ['#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#06B6D4', '#6366F1', '#D946EF', '#84CC16']

# Role assignments for known players
ROLE_MAP = {
    # Wicket-keepers
    "Jos Buttler": "WK", "MS Dhoni": "WK", "Rishabh Pant": "WK", "Sanju Samson": "WK",
    "Ishan Kishan": "WK", "KL Rahul": "WK", "Dhruv Jurel": "WK", "Jitesh Sharma": "WK",
    "Anuj Rawat": "WK", "Kumar Kushagra": "WK", "Abishek Porel": "WK", "Tim Seifert": "WK",
    "Urvil Patel": "WK", "Glenn Phillips": "WK", "Josh Inglis": "WK", "Ryan Rickelton": "WK",
    "Matthew Breetzke": "WK", "Prabhsimran Singh": "WK", "Heinrich Klaasen": "WK",
    "Tejasvi Dahiya": "WK", "Vishnu Vinod": "WK",
    # Batsmen
    "Rohit Sharma": "BAT", "Virat Kohli": "BAT", "Yashasvi Jaiswal": "BAT",
    "Travis Head": "BAT", "Shubman Gill": "BAT", "Suryakumar Yadav": "BAT",
    "Shreyas Iyer": "BAT", "Tilak Varma": "BAT", "Nicholas Pooran": "BAT",
    "David Miller": "BAT", "Tim David": "BAT", "Rinku Singh": "BAT",
    "Shimron Hetmyer": "BAT", "Tristan Stubbs": "BAT", "Dewald Brevis": "BAT",
    "Liam Livingstone": "BAT", "Finn Allen": "BAT", "Mitchell Owen": "BAT",
    "Rachin Ravindra": "BAT", "Sai Sudharsan": "BAT", "Ruturaj Gaikwad": "BAT",
    "Riyan Parag": "BAT", "Sarfaraz Khan": "BAT", "Rajat Patidar": "BAT",
    "Devdutt Padikkal": "BAT", "Prithvi Shaw": "BAT", "Shashank Singh": "BAT",
    "Ayush Badoni": "BAT", "Nitish Rana": "BAT", "Rovman Powell": "BAT",
    "Rahul Tripathi": "BAT", "Manish Pandey": "BAT", "Ajinkya Rahane": "BAT",
    "Phil Salt": "BAT", "Abhishek Sharma": "BAT", "Vaibhav Sooryavanshi": "BAT",
    "Angkrish Raghuvanshi": "BAT", "M Shahrukh Khan": "BAT", "Priyansh Arya": "BAT",
    "Aiden Markram": "BAT", "Will Jacks": "BAT", "Donovan Ferreira": "BAT",
    "Naman Dhir": "BAT", "Pathum Nissanka": "BAT", "Ben Duckett": "BAT",
    "Sherfane Rutherford": "BAT", "Karun Nair": "BAT", "Tom Banton": "BAT",
    "Mayank Rawat": "BAT", "Harnoor Singh": "BAT", "Prince Yadav": "BAT",
    "Sameer Rizvi": "BAT", "Ayush Mhatre": "BAT", "Nehal Wadhera": "BAT",
    "Aniket Verma": "BAT", "Venkatesh Iyer": "BAT",
    # Bowlers
    "Jasprit Bumrah": "BOWL", "Mitchell Starc": "BOWL", "Josh Hazlewood": "BOWL",
    "Kuldeep Yadav": "BOWL", "Yuzvendra Chahal": "BOWL", "Rashid Khan": "BOWL",
    "Trent Boult": "BOWL", "Kagiso Rabada": "BOWL", "T Natarajan": "BOWL",
    "Arshdeep Singh": "BOWL", "Mohammed Siraj": "BOWL", "Anrich Nortje": "BOWL",
    "Jofra Archer": "BOWL", "Mayank Yadav": "BOWL", "Nandre Burger": "BOWL",
    "Pat Cummins": "BOWL", "Prasidh Krishna": "BOWL", "Lockie Ferguson": "BOWL",
    "Khaleel Ahmed": "BOWL", "Marco Jansen": "BOWL", "Spencer Johnson": "BOWL",
    "Harshit Rana": "BOWL", "Matt Henry": "BOWL", "Mohammed Shami": "BOWL",
    "Bhuvneshwar Kumar": "BOWL", "Deepak Chahar": "BOWL", "Avesh Khan": "BOWL",
    "Rasikh Salam": "BOWL", "Kartik Tyagi": "BOWL", "Shivam Mavi": "BOWL",
    "Matheesha Pathirana": "BOWL", "Kuldeep Sen": "BOWL", "Ashwani Kumar": "BOWL",
    "Ishant Sharma": "BOWL", "Lungi Ngidi": "BOWL", "Anshul Kamboj": "BOWL",
    "Vignesh Puthur": "BOWL", "Mukesh Kumar": "BOWL", "Yash Dayal": "BOWL",
    "Harshal Patel": "BOWL", "Vaibhav Arora": "BOWL", "Sandeep Sharma": "BOWL",
    "Mukesh Choudhary": "BOWL", "Arjun Tendulkar": "BOWL", "Dushmantha Chameera": "BOWL",
    "Noor Ahmad": "BOWL", "Umran Malik": "BOWL", "Jacob Duffy": "BOWL",
    "Lhuan-dre Pretorius": "BOWL", "Eshan Malinga": "BOWL", "Kyle Jamieson": "BOWL",
    "Blessing Muzarabani": "BOWL", "Mohsin Khan": "BOWL", "Tushar Deshpande": "BOWL",
    "Yash Thakur": "BOWL", "Jason Holder": "BOWL", "Mangesh Yadav": "BOWL",
    "Suyash Sharma": "BOWL", "Harsh Dubey": "BOWL", "Akshat Raghuwanshi": "BOWL",
    "AM Ghazanfar": "BOWL", "Manimaran Siddharth": "BOWL", "Ravichandran Smaran": "BOWL",
    "Digvesh Rathi": "BOWL", "Vijaykumar Vyshak": "BOWL", "Xavier Bartlett": "BOWL",
    "Auqib Nabi": "BOWL", "Mayank Markande": "BOWL", "Prashant Veer": "BOWL",
    "Shivang Kumar": "BOWL", "Ravi Bishnoi": "BOWL",
    # All-rounders
    "Hardik Pandya": "AR", "Axar Patel": "AR", "Sunil Narine": "AR",
    "Ravindra Jadeja": "AR", "Washington Sundar": "AR", "Wanindu Hasaranga": "AR",
    "Cooper Connolly": "AR", "Jacob Bethell": "AR", "Krunal Pandya": "AR",
    "Mitchell Santner": "AR", "Akeal Hosein": "AR", "Corbin Bosch": "AR",
    "Dasun Shanaka": "AR", "Rahul Tewatia": "AR", "Abdul Samad": "AR",
    "Kamindu Mendis": "AR", "Cameron Green": "AR", "Musheer Khan": "AR",
    "Shardul Thakur": "AR", "Romario Shepherd": "AR", "Anukul Roy": "AR",
    "Ramandeep Singh": "AR", "Matthew Short": "AR", "Kartik Sharma": "AR",
    "Sai Kishore": "AR", "Rahul Chahar": "AR", "Varun Chakravarthy": "AR",
    "Vipraj Nigam": "AR", "Shivam Dube": "AR", "Azmatullah Omarzai": "AR",
    "Jamie Overton": "AR", "Arshad Khan": "AR", "Zeeshan Ansari": "AR",
    "Shahbaz Ahmed": "AR", "Harpreet Brar": "AR", "Salil Arora": "AR",
    "Nitish Kumar Reddy": "AR", "Jaydev Unadkat": "AR", "Shubham Dubey": "AR",
    "Mitchell Marsh": "AR",
}

def run_seed():
    db = SessionLocal()
    try:
        db.query(models.MatchScore).delete()
        db.query(models.CaptainPick).delete()
        db.query(models.Player).delete()
        db.query(models.Team).delete()
        db.commit()

        lines = [line.strip() for line in data_blob.split('\n') if line.strip()]
        
        current_team = None
        team_idx = 0
        
        for line in lines:
            if line in team_names:
                tcode = line.lower().replace(" ", "_").replace("(", "").replace(")", "").replace("'", "")
                current_team = models.Team(
                    team_code=tcode,
                    name=line,
                    owner_name=owner_names.get(line, line),
                    color_hex=colors[team_idx % len(colors)],
                    password_env_key=f"TEAM_PASSWORD_{team_idx+1:02d}"
                )
                db.add(current_team)
                db.commit()
                db.refresh(current_team)
                team_idx += 1
            else:
                if current_team:
                    role_key = ROLE_MAP.get(line, "BAT")
                    p = models.Player(
                        name=line,
                        team_id=current_team.id,
                        ipl_team="Unknown",
                        role=models.RoleEnum[role_key]
                    )
                    db.add(p)
        
        db.commit()
        print("Successfully seeded all real 12 teams and their players!")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_seed()
