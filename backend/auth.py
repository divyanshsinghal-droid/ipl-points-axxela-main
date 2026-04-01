import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from dotenv import load_dotenv
from fastapi.security import OAuth2PasswordBearer
from fastapi import Depends, HTTPException, status

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "fallback_secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/team-login")

def verify_password(plain_password, hashed_password):
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        return pwd_context.verify(plain_password, hashed_password)
    return plain_password == hashed_password

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_team(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        team_code: str = payload.get("team_code")
        if team_code is None:
            raise credentials_exception
        team_id: str = payload.get("sub")
        return {"team_id": int(team_id), "team_code": team_code}
    except JWTError:
        raise credentials_exception

def get_current_admin(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role != "admin":
            raise credentials_exception
        return {"role": "admin"}
    except JWTError:
        raise credentials_exception
