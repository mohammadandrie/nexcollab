"""Chat routes: read messages, send, share to Chat All."""
from __future__ import annotations
from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel

from . import db, auth, llm

router = APIRouter(prefix="/api", tags=["chat"])


def _load_chat_or_403(chat_id: int, user: dict) -> dict:
    chat = db.fetchone("SELECT * FROM chats WHERE id = ?", (chat_id,))
    if not chat:
        raise HTTPException(status_code=404, detail="chat_not_found")

    member = db.fetchone(
        "SELECT 1 FROM project_members WHERE project_id=? AND user_id=?",
        (chat["project_id"], user["id"]),
    )
    if not member:
        raise HTTPException(status_code=403, detail="not_a_member")

    if chat["kind"] == "private" and chat["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="not_your_private_chat")
    return dict(chat)


@router.get("/chats/{chat_id}/messages")
def list_messages(chat_id: int, request: Request):
    user = auth.current_user(request)
    _load_chat_or_403(chat_id, user)

    rows = db.fetchall(
        """
        SELECT m.id, m.role, m.content, m.author_id, m.shared_from_chat_id,
               m.created_at,
               u.name AS author_name, u.role AS author_role,
               u.color AS author_color, u.avatar_letter AS author_letter
        FROM messages m
        LEFT JOIN users u ON u.id = m.author_id
        WHERE m.chat_id = ?
        ORDER BY m.id ASC
        """,
        (chat_id,),
    )
    return {"messages": [dict(r) for r in rows]}


class SendIn(BaseModel):
    content: str


@router.post("/chats/{chat_id}/messages")
def send_message(chat_id: int, body: SendIn, request: Request):
    user = auth.current_user(request)
    chat = _load_chat_or_403(chat_id, user)

    text = body.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="empty_message")

    with db.connect() as cx:
        cur = cx.execute(
            "INSERT INTO messages(chat_id,author_id,role,content) VALUES (?,?,?,?)",
            (chat_id, user["id"], "user", text),
        )
        user_msg_id = cur.lastrowid

    assistant_msg = None
    # Only private chats trigger an LLM reply. Chat All is human-shared log.
    if chat["kind"] == "private":
        proj = db.fetchone("SELECT * FROM projects WHERE id = ?", (chat["project_id"],))
        history = db.fetchall(
            "SELECT role, content FROM messages WHERE chat_id=? ORDER BY id ASC LIMIT 40",
            (chat_id,),
        )
        sys_prompt = llm.build_system_prompt(
            name=user["name"], role=user["role"],
            project_name=proj["name"] if proj else "Nexcollab",
            project_desc=proj["description"] if proj else "",
        )
        msgs = [{"role": "system", "content": sys_prompt}]
        msgs.extend({"role": r["role"], "content": r["content"]} for r in history)

        try:
            reply = llm.chat_complete(msgs)
        except Exception as exc:  # surface gateway error inline
            reply = f"_[LLM error: {type(exc).__name__}: {exc}]_"

        with db.connect() as cx:
            cur = cx.execute(
                "INSERT INTO messages(chat_id,author_id,role,content) VALUES (?,NULL,?,?)",
                (chat_id, "assistant", reply),
            )
            assistant_msg_id = cur.lastrowid
        assistant_msg = {
            "id": assistant_msg_id, "role": "assistant",
            "content": reply, "author_id": None,
        }

    return {"user_message_id": user_msg_id, "assistant_message": assistant_msg}


class ShareIn(BaseModel):
    note: str | None = None  # optional headline written by the user


@router.post("/messages/{message_id}/share")
def share_to_chat_all(message_id: int, body: ShareIn, request: Request):
    """Promote a message from a private chat into the project's Chat All."""
    user = auth.current_user(request)

    src = db.fetchone(
        """
        SELECT m.*, c.project_id, c.kind, c.owner_id
        FROM messages m JOIN chats c ON c.id = m.chat_id
        WHERE m.id = ?
        """,
        (message_id,),
    )
    if not src:
        raise HTTPException(status_code=404, detail="message_not_found")
    if src["kind"] != "private" or src["owner_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="not_your_message")

    chat_all = db.fetchone(
        "SELECT id FROM chats WHERE project_id=? AND kind='all'",
        (src["project_id"],),
    )
    if not chat_all:
        raise HTTPException(status_code=500, detail="chat_all_missing")

    headline = (body.note or "").strip()
    if src["role"] == "assistant":
        body_text = f"_From Hermes (shared by {user['name']}):_\n\n{src['content']}"
    else:
        body_text = src["content"]
    if headline:
        body_text = f"**{headline}**\n\n{body_text}"

    with db.connect() as cx:
        cur = cx.execute(
            """
            INSERT INTO messages(chat_id,author_id,role,content,shared_from_chat_id)
            VALUES (?,?,?,?,?)
            """,
            (chat_all["id"], user["id"], "user", body_text, src["chat_id"]),
        )
        new_id = cur.lastrowid

    return {"ok": True, "chat_all_id": chat_all["id"], "new_message_id": new_id}
