import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_user
from .db import database, now, public_user
from .friends import friendship
from .models import MessageInput

router = APIRouter(prefix="/api", tags=["消息"])


def message_dto(row):
    return {"id": row["id"], "senderId": row["sender_id"], "receiverId": row["receiver_id"],
            "body": row["body"], "createdAt": row["created_at"], "readAt": row["read_at"]}


def require_friend(connection, user_id, peer_id):
    if not friendship(connection, user_id, peer_id):
        raise HTTPException(403, "互加好友后即可发送消息")


@router.get("/conversations")
def conversations(user=Depends(current_user)):
    with database() as connection:
        peers = connection.execute(
            "SELECT users.* FROM friends JOIN users ON users.id=CASE WHEN first_id=? THEN second_id ELSE first_id END "
            "WHERE first_id=? OR second_id=?", (user["id"], user["id"], user["id"])
        ).fetchall()
        result = []
        for peer in peers:
            last = connection.execute(
                "SELECT * FROM messages WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?) "
                "ORDER BY created_at DESC LIMIT 1", (user["id"], peer["id"], peer["id"], user["id"])
            ).fetchone()
            unread = connection.execute(
                "SELECT COUNT(*) FROM messages WHERE sender_id=? AND receiver_id=? AND read_at IS NULL",
                (peer["id"], user["id"])
            ).fetchone()[0]
            result.append({"user": public_user(peer), "lastMessage": message_dto(last) if last else None,
                           "unread": unread})
        return sorted(result, key=lambda item: item["lastMessage"]["createdAt"] if item["lastMessage"] else "", reverse=True)


@router.get("/messages/{peer_id}")
def get_messages(peer_id: str, before: str = "", limit: int = Query(default=50, ge=1, le=100),
                 user=Depends(current_user)):
    with database() as connection:
        require_friend(connection, user["id"], peer_id)
        rows = connection.execute(
            "SELECT * FROM messages WHERE ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)) "
            "AND (?='' OR created_at<?) ORDER BY created_at DESC LIMIT ?",
            (user["id"], peer_id, peer_id, user["id"], before, before, limit)
        ).fetchall()
        connection.execute("UPDATE messages SET read_at=? WHERE sender_id=? AND receiver_id=? AND read_at IS NULL",
                           (now(), peer_id, user["id"]))
        peer = connection.execute("SELECT * FROM users WHERE id=?", (peer_id,)).fetchone()
        return {"user": public_user(peer), "messages": [message_dto(row) for row in reversed(rows)]}


@router.post("/messages/{peer_id}", status_code=201)
def send_message(peer_id: str, data: MessageInput, user=Depends(current_user)):
    if not data.body.strip():
        raise HTTPException(400, "消息不能为空")
    with database() as connection:
        require_friend(connection, user["id"], peer_id)
        message_id = uuid.uuid4().hex
        connection.execute("INSERT INTO messages VALUES (?,?,?,?,?,NULL)",
                           (message_id, user["id"], peer_id, data.body.strip(), now()))
        return message_dto(connection.execute("SELECT * FROM messages WHERE id=?", (message_id,)).fetchone())
