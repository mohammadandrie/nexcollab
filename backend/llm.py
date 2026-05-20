"""Thin OpenAI-compatible client for the Hermes local gateway."""
from __future__ import annotations
import httpx
from typing import Iterable

from .config import LLM_BASE_URL, LLM_API_KEY, LLM_MODEL


SYSTEM_PROMPT_TEMPLATE = (
    "You are Hermes, the AI assistant inside Nexcollab — an internal team "
    "workspace for the enowX team. You are talking privately with {name} "
    "(role: {role}). Be direct, concise, and action-oriented. Reply in the "
    "user's language (default Indonesian if mixed). Keep replies short unless "
    "the user explicitly asks for depth. When the user says 'send to chat all' "
    "or similar, treat that as a UI action — do not echo it.\n\n"
    "Project context: {project_name} — {project_desc}"
)


def build_system_prompt(name: str, role: str, project_name: str, project_desc: str) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        name=name, role=role,
        project_name=project_name, project_desc=project_desc or "(no description)",
    )


def chat_complete(messages: Iterable[dict], *, model: str | None = None,
                  timeout: float = 60.0) -> str:
    """Blocking call. Returns assistant text or raises httpx error."""
    payload = {
        "model": model or LLM_MODEL,
        "messages": list(messages),
        "stream": False,
        "max_tokens": 1024,
        "temperature": 0.7,
    }
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{LLM_BASE_URL}/chat/completions",
                        json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
    return data["choices"][0]["message"]["content"].strip()
