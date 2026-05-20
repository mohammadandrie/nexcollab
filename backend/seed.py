"""Seed default team + sample project. Idempotent."""
from __future__ import annotations
from . import db

TEAM = [
    # username, name, role, color, letter
    ("tyo",     "Tyo",     "PM",  "#a78bfa", "T"),
    ("hamfik",  "Hamfik",  "UX",  "#f472b6", "H"),
    ("hari",    "Hari",    "DEV", "#34d399", "H"),
    ("chalif",  "Chalif",  "DEV", "#34d399", "C"),
    ("andre",   "Andre",   "QA",  "#fbbf24", "A"),
]


def seed() -> None:
    db.init_db()
    with db.connect() as cx:
        # Users
        for username, name, role, color, letter in TEAM:
            cx.execute(
                "INSERT OR IGNORE INTO users(username,name,role,color,avatar_letter) "
                "VALUES (?,?,?,?,?)",
                (username, name, role, color, letter),
            )

        # One sample project (idempotent by name)
        row = cx.execute(
            "SELECT id FROM projects WHERE name = ?",
            ("Nexcollab Launch",),
        ).fetchone()
        if row is None:
            cur = cx.execute(
                "INSERT INTO projects(name,description) VALUES (?,?)",
                (
                    "Nexcollab Launch",
                    "Workspace tim untuk merilis Nexcollab — UI, backend, QA.",
                ),
            )
            project_id = cur.lastrowid
        else:
            project_id = row["id"]

        # All team members joined
        users = cx.execute("SELECT id FROM users").fetchall()
        for u in users:
            cx.execute(
                "INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES (?,?)",
                (project_id, u["id"]),
            )

        # Shared 'all' chat for the project
        cx.execute(
            "INSERT OR IGNORE INTO chats(project_id,kind,owner_id) VALUES (?,?,NULL)",
            (project_id, "all"),
        )

        # Per-user private chats
        for u in users:
            cx.execute(
                "INSERT OR IGNORE INTO chats(project_id,kind,owner_id) VALUES (?,?,?)",
                (project_id, "private", u["id"]),
            )


if __name__ == "__main__":
    seed()
    print("seed: ok")
