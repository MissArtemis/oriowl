import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import dotenv_values

API_ROOT = Path(__file__).resolve().parents[1]
KEY_PATTERN = re.compile(r"[a-zA-Z0-9]{32}")


def read_photo_limit() -> int:
    product = json.loads((API_ROOT.parent / "config" / "product.json").read_text(encoding="utf-8"))
    limit = product["maxPhotosPerNote"]
    if type(limit) is not int or limit < 1:
        raise ValueError("config/product.json: maxPhotosPerNote must be a positive integer")
    return limit


@dataclass(frozen=True)
class Config:
    js_key: str = field(default="", repr=False)
    js_secret: str = field(default="", repr=False)
    web_key: str = field(default="", repr=False)
    port: int = 8787

    @property
    def map_configured(self) -> bool:
        return bool(KEY_PATTERN.fullmatch(self.js_key) and KEY_PATTERN.fullmatch(self.js_secret))

    @property
    def search_configured(self) -> bool:
        return bool(KEY_PATTERN.fullmatch(self.web_key))


def read_config() -> Config:
    # Reload the file per request so local key changes do not require a restart.
    env = {**dotenv_values(API_ROOT / ".env"), **os.environ}
    return Config(
        js_key=(env.get("AMAP_JS_KEY") or "").strip(),
        js_secret=(env.get("AMAP_SECURITY_JS_CODE") or "").strip(),
        web_key=(env.get("AMAP_WEB_KEY") or "").strip(),
        port=int(env.get("PORT") or 8787),
    )
