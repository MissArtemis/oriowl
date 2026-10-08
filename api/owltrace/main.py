from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .db import initialize
from . import auth, friends, maps, media, messages, notes


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize()
    async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
        app.state.http = client
        yield


app = FastAPI(title="OwlTrace · 鹰迹 API", version="0.2.0", lifespan=lifespan)
# LAN development: requests originate from Expo Go or the local web preview.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["*"])
for router in (maps.router, auth.router, media.router, notes.router, friends.router, messages.router):
    app.include_router(router)


@app.middleware("http")
async def response_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
