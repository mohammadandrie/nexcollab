"""SQLite schema + tiny helper layer."""
from __future__ import annotations
import sqlite3
from contextlib import contextmanager
from typing import Iterator

from .config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,             -- PM | UX | DEV | QA
    color TEXT NOT NULL,
    avatar_letter TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
);

-- One private chat per (project, user), one 'all' per project,
-- and one 'general' per user (project_id NULL — out-of-project brainstorm).
CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,             -- 'private' | 'all' | 'general'
    owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(project_id, kind, owner_id)
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    author_id INTEGER REFERENCES users(id),  -- null when role='assistant'
    role TEXT NOT NULL,             -- 'user' | 'assistant' | 'system'
    content TEXT NOT NULL,
    shared_from_chat_id INTEGER REFERENCES chats(id),  -- when promoted to 'all'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, id);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);
"""


def init_db() -> None:
    with connect() as cx:
        cx.executescript(SCHEMA)
        _migrate(cx)


def _migrate(cx: sqlite3.Connection) -> None:
    """Idempotent runtime migrations for older DBs."""
    # v1 → v2: chats.project_id became nullable + 'general' kind allowed.
    row = cx.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='chats'"
    ).fetchone()
    if row and "project_id INTEGER NOT NULL" in row["sql"]:
        cx.executescript("""
            BEGIN;
            CREATE TABLE chats_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(project_id, kind, owner_id)
            );
            INSERT INTO chats_new(id, project_id, kind, owner_id)
                SELECT id, project_id, kind, owner_id FROM chats;
            DROP TABLE chats;
            ALTER TABLE chats_new RENAME TO chats;
            CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);
            COMMIT;
        """)


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    cx = sqlite3.connect(DB_PATH, isolation_level=None)
    cx.row_factory = sqlite3.Row
    cx.execute("PRAGMA foreign_keys = ON")
    cx.execute("PRAGMA journal_mode = WAL")
    try:
        yield cx
    finally:
        cx.close()


def fetchone(sql: str, params: tuple = ()) -> sqlite3.Row | None:
    with connect() as cx:
        return cx.execute(sql, params).fetchone()


def fetchall(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    with connect() as cx:
        return cx.execute(sql, params).fetchall()


def execute(sql: str, params: tuple = ()) -> int:
    with connect() as cx:
        cur = cx.execute(sql, params)
        return cur.lastrowid or 0
