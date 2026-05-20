"""FastAPI entry point. Run: .venv/bin/uvicorn backend.main:app --port 8091"""
from __future__ import annotations
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import ROOT
from . import seed as _seed
from . import routes_auth, routes_projects, routes_chat

app = FastAPI(title="Nexcollab", version="0.1.0")

# Make sure DB exists & is seeded on cold start.
_seed.seed()

app.include_router(routes_auth.router)
app.include_router(routes_projects.router)
app.include_router(routes_chat.router)


STATIC_DIR = ROOT / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/")
def root():
    return FileResponse(STATIC_DIR / "app.html")


@app.get("/login")
def login_page():
    return FileResponse(STATIC_DIR / "login.html")


@app.get("/mockup")
def mockup():
    return FileResponse(STATIC_DIR / "mockup.html")


@app.get("/docs")
def docs_redirect():
    return RedirectResponse("/static/docs.html")
