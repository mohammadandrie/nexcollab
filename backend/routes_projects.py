"""Project + chat listing routes."""
from __future__ import annotations
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from . import db, auth

router = APIRouter(prefix="/api", tags=["projects"])


@router.get("/projects")
def list_projects(request: Request):
    user = auth.current_user(request)
    rows = db.fetchall(
        """
        SELECT p.id, p.name, p.description
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
        WHERE pm.user_id = ?
        ORDER BY p.id
        """,
        (user["id"],),
    )
    return {"projects": [dict(r) for r in rows]}


@router.get("/projects/{project_id}")
def project_detail(project_id: int, request: Request):
    user = auth.current_user(request)

    proj = db.fetchone("SELECT * FROM projects WHERE id = ?", (project_id,))
    if not proj:
        raise HTTPException(status_code=404, detail="project_not_found")

    member = db.fetchone(
        "SELECT 1 FROM project_members WHERE project_id=? AND user_id=?",
        (project_id, user["id"]),
    )
    if not member:
        raise HTTPException(status_code=403, detail="not_a_member")

    members = db.fetchall(
        """
        SELECT u.id, u.username, u.name, u.role, u.color, u.avatar_letter
        FROM users u JOIN project_members pm ON pm.user_id = u.id
        WHERE pm.project_id = ? ORDER BY u.id
        """,
        (project_id,),
    )

    private = db.fetchone(
        "SELECT id FROM chats WHERE project_id=? AND kind='private' AND owner_id=?",
        (project_id, user["id"]),
    )
    chat_all = db.fetchone(
        "SELECT id FROM chats WHERE project_id=? AND kind='all'",
        (project_id,),
    )

    return {
        "project": dict(proj),
        "members": [dict(m) for m in members],
        "my_private_chat_id": private["id"] if private else None,
        "chat_all_id": chat_all["id"] if chat_all else None,
    }


class CreateProjectIn(BaseModel):
    name: str
    description: str | None = None
    member_ids: list[int] | None = None  # default: all users


@router.post("/projects")
def create_project(body: CreateProjectIn, request: Request):
    user = auth.current_user(request)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name_required")

    with db.connect() as cx:
        cur = cx.execute(
            "INSERT INTO projects(name,description) VALUES (?,?)",
            (name, (body.description or "").strip()),
        )
        project_id = cur.lastrowid

        # Members: explicit list, else everyone. Always include creator.
        if body.member_ids:
            ids = set(body.member_ids) | {user["id"]}
        else:
            ids = {r["id"] for r in cx.execute("SELECT id FROM users").fetchall()}

        for uid in ids:
            cx.execute(
                "INSERT OR IGNORE INTO project_members(project_id,user_id) VALUES (?,?)",
                (project_id, uid),
            )

        # One Chat All + per-member private chats
        cx.execute(
            "INSERT INTO chats(project_id,kind,owner_id) VALUES (?,?,NULL)",
            (project_id, "all"),
        )
        for uid in ids:
            cx.execute(
                "INSERT INTO chats(project_id,kind,owner_id) VALUES (?,?,?)",
                (project_id, "private", uid),
            )

    return {"ok": True, "project_id": project_id}
