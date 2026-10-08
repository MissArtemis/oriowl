import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_user
from .db import database, now, public_user
from .models import FriendInput

router = APIRouter(prefix="/api", tags=["好友"])


def friendship(connection, first: str, second: str):
    return connection.execute("SELECT 1 FROM friends WHERE first_id=? AND second_id=?",
                              tuple(sorted((first, second)))).fetchone()


@router.get("/users")
def find_users(q: str = Query(min_length=1, max_length=24), user=Depends(current_user)):
    with database() as connection:
        rows = connection.execute(
            "SELECT * FROM users WHERE id<>? AND (username LIKE ? OR nickname LIKE ?) LIMIT 20",
            (user["id"], "%" + q + "%", "%" + q + "%")
        ).fetchall()
        result = []
        for row in rows:
            request = connection.execute(
                "SELECT status FROM friend_requests WHERE sender_id=? AND receiver_id=?",
                (user["id"], row["id"])
            ).fetchone()
            status = "friend" if friendship(connection, user["id"], row["id"]) else (
                "pending" if request and request["status"] == "pending" else "none")
            result.append({**public_user(row), "friendStatus": status})
        return result


@router.get("/friends")
def friends(user=Depends(current_user)):
    with database() as connection:
        rows = connection.execute(
            "SELECT users.* FROM friends JOIN users ON users.id=CASE WHEN first_id=? THEN second_id ELSE first_id END "
            "WHERE first_id=? OR second_id=?", (user["id"], user["id"], user["id"])
        ).fetchall()
        return [public_user(row) for row in rows]


@router.get("/friends/requests")
def friend_requests(user=Depends(current_user)):
    with database() as connection:
        rows = connection.execute(
            "SELECT friend_requests.*, users.username, users.nickname FROM friend_requests "
            "JOIN users ON users.id=sender_id WHERE receiver_id=? AND status='pending' ORDER BY created_at DESC",
            (user["id"],)
        ).fetchall()
        return [{"id": row["id"], "user": {"id": row["sender_id"], "username": row["username"],
                                         "nickname": row["nickname"]}} for row in rows]


@router.post("/friends/requests", status_code=201)
def request_friend(data: FriendInput, user=Depends(current_user)):
    with database() as connection:
        other = connection.execute("SELECT id FROM users WHERE id=?", (data.userId,)).fetchone()
        if not other or data.userId == user["id"]:
            raise HTTPException(400, "请选择其他用户")
        if friendship(connection, user["id"], data.userId):
            return {"status": "friend"}
        connection.execute(
            "INSERT INTO friend_requests VALUES (?,?,?,?,?) ON CONFLICT(sender_id,receiver_id) "
            "DO UPDATE SET status='pending', created_at=excluded.created_at",
            (uuid.uuid4().hex, user["id"], data.userId, "pending", now())
        )
        return {"status": "pending"}


@router.post("/friends/requests/{request_id}/accept")
def accept_friend(request_id: str, user=Depends(current_user)):
    with database() as connection:
        request = connection.execute(
            "SELECT * FROM friend_requests WHERE id=? AND receiver_id=? AND status='pending'",
            (request_id, user["id"])
        ).fetchone()
        if not request:
            raise HTTPException(404, "好友申请不存在")
        connection.execute("INSERT OR IGNORE INTO friends VALUES (?,?)",
                           tuple(sorted((request["sender_id"], user["id"]))))
        connection.execute("UPDATE friend_requests SET status='accepted' WHERE (sender_id=? AND receiver_id=?) "
                           "OR (sender_id=? AND receiver_id=?)",
                           (request['sender_id'], user['id'], user['id'], request['sender_id']))
        return {"ok": True}
