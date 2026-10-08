import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from .config import API_ROOT


def data_root() -> Path:
    return Path(os.environ.get("OWLTRACE_DATA_DIR", API_ROOT / "data")).resolve()


@contextmanager
def database():
    directory = data_root()
    directory.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(directory / "owltrace.sqlite3", timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize():
    with database() as connection:
        connection.executescript(Path(__file__).with_name("schema.sql").read_text(encoding="utf-8"))


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def public_user(row) -> dict:
    return {"id": row["id"], "username": row["username"], "nickname": row["nickname"]}
