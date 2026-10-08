import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import database, now, public_user
from .models import Credentials

router = APIRouter(prefix="/api/auth", tags=["账号"])
bearer = HTTPBearer(auto_error=False)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600_000).hex()


def optional_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        return None
    with database() as connection:
        row = connection.execute(
            "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id "
            "WHERE token_hash=? AND expires_at>?", (digest(credentials.credentials), time.time())
        ).fetchone()
    return public_user(row) if row else None


def current_user(user=Depends(optional_user)):
    if not user:
        raise HTTPException(401, "请先登录，或重新登录已过期的账号")
    return user


def create_session(connection, user) -> dict:
    token = secrets.token_urlsafe(32)
    connection.execute("INSERT INTO sessions VALUES (?,?,?)",
                       (digest(token), user["id"], time.time() + 30 * 86400))
    return {"token": token, "user": public_user(user)}


@router.post("/register", status_code=201)
def register(data: Credentials):
    salt = secrets.token_hex(16)
    password = salt + ":" + hash_password(data.password, salt)
    with database() as connection:
        try:
            connection.execute("INSERT INTO users VALUES (?,?,?,?,?)",
                               (uuid.uuid4().hex, data.username.lower(), data.nickname.strip() or data.username,
                                password, now()))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "这个账号名已经有人使用") from None
        user = connection.execute("SELECT * FROM users WHERE username=?", (data.username.lower(),)).fetchone()
        return create_session(connection, user)


@router.post("/login")
def login(data: Credentials):
    with database() as connection:
        user = connection.execute("SELECT * FROM users WHERE username=?", (data.username.lower(),)).fetchone()
        if not user:
            raise HTTPException(401, "账号或密码不正确")
        salt, saved = user["password_hash"].split(":")
        if not hmac.compare_digest(saved, hash_password(data.password, salt)):
            raise HTTPException(401, "账号或密码不正确")
        return create_session(connection, user)


@router.get("/me")
def me(user=Depends(current_user)):
    return user


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials:
        with database() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash=?", (digest(credentials.credentials),))
    return {"ok": True}
