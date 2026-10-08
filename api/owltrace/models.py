from typing import Literal

from pydantic import BaseModel, Field


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_]+$")
    password: str = Field(min_length=8, max_length=128)
    nickname: str = Field(default="", max_length=24)


class Place(BaseModel):
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    name: str = Field(max_length=160)
    address: str = Field(default="", max_length=500)
    city: str = Field(default="", max_length=80)


class NoteInput(BaseModel):
    title: str = Field(min_length=1, max_length=60)
    body: str = Field(default="", max_length=5000)
    place: Place
    photoIds: list[str] = Field(default_factory=list, max_length=9)
    category: Literal["风景", "城市", "美食", "日常"] = "风景"
    visibility: Literal["public", "private"] = "public"
    favorite: bool = False


class FriendInput(BaseModel):
    userId: str


class MessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
