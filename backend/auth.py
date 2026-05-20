"""Cookie session — signed username (no password, internal team workspace)."""
from __future__ import annotations
from itsdangerous import URLSafeSerializer, BadSignature
from fastapi import Request, HTTPException

from . import db
from .config import SESSION_SECRET

COOKIE_NAME = "nexcollab_session"
_signer = URLSafeSerializer(SESSION_SECRET, salt="nexcollab-session-v1")


def issue(username: str) -> str:
    return _signer.dumps({"u": username})


def read(request: Request) -> str | None:
    raw = request.cookies.get(COOKIE_NAME)
    if not raw:
        return None
    try:
        data = _signer.loads(raw)
    except BadSignature:
        return None
    return data.get("u")


def current_user(request: Request) -> dict:
    username = read(request)
    if not username:
        raise HTTPException(status_code=401, detail="not_logged_in")
    row = db.fetchone("SELECT * FROM users WHERE username = ?", (username,))
    if not row:
        raise HTTPException(status_code=401, detail="user_not_found")
    return dict(row)
