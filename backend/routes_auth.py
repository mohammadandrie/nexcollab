"""Auth routes: login by username (internal team — no password)."""
from __future__ import annotations
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel

from . import db, auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str


@router.post("/login")
def login(body: LoginIn, response: Response):
    username = body.username.strip().lower()
    row = db.fetchone("SELECT * FROM users WHERE username = ?", (username,))
    if not row:
        raise HTTPException(status_code=404, detail="unknown_user")
    token = auth.issue(username)
    response.set_cookie(
        auth.COOKIE_NAME, token,
        httponly=True, samesite="lax", max_age=60 * 60 * 24 * 30,
        path="/",
    )
    return {"ok": True, "user": dict(row)}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(auth.COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(request: Request):
    user = auth.current_user(request)
    return {"user": user}


@router.get("/users")
def list_users():
    rows = db.fetchall("SELECT id, username, name, role, color, avatar_letter FROM users")
    return {"users": [dict(r) for r in rows]}
