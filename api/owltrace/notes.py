import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_user, optional_user
from .db import database, now
from .media import photo_dto
from .models import NoteInput

router = APIRouter(prefix="/api/notes", tags=["笔记"])
NOTE_QUERY = ("SELECT notes.*, users.username, users.nickname FROM notes "
              "JOIN users ON users.id=notes.owner_id ")
ACTIVE = "NOT EXISTS (SELECT 1 FROM note_deletions WHERE note_id=notes.id)"


def note_dto(connection, row):
    photos = []
    for photo_id in json.loads(row["photo_ids"]):
        photo = connection.execute("SELECT * FROM media WHERE id=?", (photo_id,)).fetchone()
        if photo:
            photos.append(photo_dto(photo))
    return {"id": row["id"], "title": row["title"], "body": row["body"],
            "place": json.loads(row["place"]), "photos": photos, "category": row["category"],
            "visibility": row["visibility"], "favorite": bool(row["favorite"]),
            "createdAt": row["created_at"], "updatedAt": row["updated_at"], "syncStatus": "synced",
            "author": {"id": row["owner_id"], "username": row["username"], "nickname": row["nickname"]}}


@router.get("/mine")
def my_notes(user=Depends(current_user)):
    with database() as connection:
        rows = connection.execute(NOTE_QUERY + "WHERE owner_id=? AND " + ACTIVE + " ORDER BY notes.created_at DESC",
                                  (user["id"],)).fetchall()
        return [note_dto(connection, row) for row in rows]


@router.get("/feed")
def feed(before: str = "", limit: int = Query(default=20, ge=1, le=50)):
    with database() as connection:
        rows = connection.execute(
            NOTE_QUERY + "WHERE " + ACTIVE + " AND visibility='public' AND (?='' OR notes.created_at<?) "
            "ORDER BY notes.created_at DESC LIMIT ?", (before, before, limit)
        ).fetchall()
        return [note_dto(connection, row) for row in rows]


@router.get("/trash")
def trash(user=Depends(current_user)):
    with database() as connection:
        rows = connection.execute(
            NOTE_QUERY + "JOIN note_deletions ON note_deletions.note_id=notes.id "
            "WHERE notes.owner_id=? ORDER BY deleted_at DESC", (user["id"],)
        ).fetchall()
        deleted = {row["note_id"]: row["deleted_at"] for row in connection.execute(
            "SELECT note_id, deleted_at FROM note_deletions WHERE owner_id=?", (user["id"],)
        )}
        return [{**note_dto(connection, row), "deletedAt": deleted[row["id"]], "deletionBackup": True} for row in rows]


@router.get("/{note_id}")
def get_note(note_id: str, user=Depends(optional_user)):
    with database() as connection:
        row = connection.execute(NOTE_QUERY + "WHERE " + ACTIVE + " AND notes.id=? AND (visibility='public' OR owner_id=?)",
                                 (note_id, user["id"] if user else "")).fetchone()
        if not row:
            raise HTTPException(404, "这篇笔记不存在或仅作者可见")
        return note_dto(connection, row)


@router.put("/{note_id}")
def save_note(note_id: str, data: NoteInput, user=Depends(current_user)):
    if not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", note_id):
        raise HTTPException(400, "笔记标识不正确")
    if not data.title.strip() or (not data.body.strip() and not data.photoIds):
        raise HTTPException(400, "添加照片或正文后再发布")
    with database() as connection:
        existing = connection.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if existing and existing["owner_id"] != user["id"]:
            raise HTTPException(403, "只能修改自己的笔记")
        if connection.execute("SELECT 1 FROM note_deletions WHERE note_id=?", (note_id,)).fetchone():
            raise HTTPException(410, "笔记已删除，请先从回收站恢复")
        for photo_id in data.photoIds:
            photo = connection.execute("SELECT owner_id FROM media WHERE id=?", (photo_id,)).fetchone()
            if not photo or photo["owner_id"] != user["id"]:
                raise HTTPException(400, "照片尚未上传，或不属于当前账号")
        timestamp = now()
        values = (note_id, user["id"], data.title.strip(), data.body.strip(),
                  data.place.model_dump_json(), json.dumps(data.photoIds), data.category,
                  data.visibility, data.favorite, existing["created_at"] if existing else timestamp, timestamp)
        connection.execute(
            "INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET "
            "title=excluded.title, body=excluded.body, place=excluded.place, photo_ids=excluded.photo_ids, "
            "category=excluded.category, visibility=excluded.visibility, favorite=excluded.favorite, "
            "updated_at=excluded.updated_at", values
        )
        row = connection.execute(NOTE_QUERY + "WHERE notes.id=?", (note_id,)).fetchone()
        return note_dto(connection, row)


@router.delete("/{note_id}")
def delete_note(note_id: str, user=Depends(current_user)):
    if not re.fullmatch(r"[a-zA-Z0-9-]{1,80}", note_id):
        raise HTTPException(400, "笔记标识不正确")
    with database() as connection:
        row = connection.execute("SELECT owner_id FROM notes WHERE id=?", (note_id,)).fetchone()
        deleted = connection.execute("SELECT owner_id FROM note_deletions WHERE note_id=?", (note_id,)).fetchone()
        if (row and row["owner_id"] != user["id"]) or (deleted and deleted["owner_id"] != user["id"]):
            raise HTTPException(403, "只能删除自己的笔记")
        connection.execute("INSERT OR IGNORE INTO note_deletions VALUES (?,?,?)", (note_id, user["id"], now()))
        return {"deleted": True, "hasBackup": bool(row)}


@router.post("/{note_id}/restore")
def restore_note(note_id: str, user=Depends(current_user)):
    with database() as connection:
        row = connection.execute("SELECT owner_id FROM notes WHERE id=?", (note_id,)).fetchone()
        deleted = connection.execute("SELECT owner_id FROM note_deletions WHERE note_id=?", (note_id,)).fetchone()
        if not row and not deleted:
            return {"restored": True}
        if (row and row["owner_id"] != user["id"]) or (deleted and deleted["owner_id"] != user["id"]):
            raise HTTPException(403, "只能恢复自己的笔记")
        connection.execute("DELETE FROM note_deletions WHERE note_id=? AND owner_id=?", (note_id, user["id"]))
        return {"restored": True}
