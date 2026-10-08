import asyncio
import math
import re
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException

from .config import Config


def proxy_url(path: str, query: list[tuple[str, str]], config: Config) -> str:
    if not re.fullmatch(r"v[345]/[a-zA-Z0-9/_-]+", path):
        raise HTTPException(400, "不支持的地图请求")
    params = [(k, v) for k, v in query if k not in ("key", "jscode")]
    for k, v in params:
        if k == "callback" and not re.fullmatch(r"[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*", v, re.ASCII):
            raise HTTPException(400, "不支持的回调格式")
    params.extend([("key", config.js_key), ("jscode", config.js_secret)])
    host = "webapi.amap.com" if path == "v4/map/styles" else "restapi.amap.com"
    return f"https://{host}/{path}?{urlencode(params)}"


def string(value) -> str:
    return value if isinstance(value, str) else ""


def place(row: dict, source: str, query: str = "") -> dict | None:
    try:
        lng, lat = map(float, string(row.get("location")).split(","))
    except (ValueError, TypeError):
        return None
    if not (math.isfinite(lng) and math.isfinite(lat) and abs(lng) <= 180 and abs(lat) <= 90):
        return None
    address = string(row.get("formatted_address")) or string(row.get("address"))
    city = string(row.get("cityname")) or string(row.get("city")) or string(row.get("province"))
    if source == "suggestion":
        address = string(row.get("district")) + address
    return {"longitude": lng, "latitude": lat, "name": string(row.get("name")) or address or query,
            "address": address, "city": city, "source": source}


async def request_amap(client: httpx.AsyncClient, path: str, params: dict, key: str) -> dict:
    try:
        response = await client.get(f"https://restapi.amap.com/{path}", params={**params, "key": key, "output": "JSON"})
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "地址服务暂时无法连接，请稍后重试") from None
    if not isinstance(data, dict):
        raise HTTPException(502, "地址服务返回了无效数据")
    if data.get("status") != "1":
        code = str(data.get("infocode", ""))
        if code in {"10003", "10004", "10010", "10019", "10020", "10021", "10044"}:
            message = "高德搜索额度或频率受限，请稍后重试或检查控制台额度"
        elif code.startswith("100"):
            message = "地址搜索配置不可用，请检查后端 Web 服务 Key、权限和 IP 限制"
        else:
            message = "高德暂时无法搜索这个地址，请换个关键词重试"
        raise HTTPException(502, message)
    return data


def distance(origin, destination):
    lng1, lat1, lng2, lat2 = map(math.radians, (origin[0], origin[1],
                                               destination["longitude"], destination["latitude"]))
    value = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return round(6371000 * 2 * math.asin(math.sqrt(min(1, value))))


async def search_places(client: httpx.AsyncClient, config: Config, query: str, city: str = "",
                        suggest: bool = False, origin: tuple[float, float] | None = None) -> dict:
    if not config.search_configured:
        raise HTTPException(503, "请在后端配置 AMAP_WEB_KEY（Web 服务 Key）以启用地址搜索")
    common = {"city": city} if city else {}
    location = {"location": f"{origin[0]:.6f},{origin[1]:.6f}"} if origin else {}
    if suggest:
        data = await request_amap(client, "v3/assistant/inputtips", {**common, **location, "keywords": query, "citylimit": "false", "datatype": "all"}, config.web_key)
        batches = [(data.get("tips", []), "suggestion")]
        failures = []
    else:
        calls = [
            request_amap(client, "v3/geocode/geo", {"address": query}, config.web_key),
            request_amap(client, "v3/place/text", {**common, "keywords": query, "citylimit": "false", "offset": "25", "page": "1", "extensions": "base"}, config.web_key),
        ]
        fields, sources = ["geocodes", "pois"], ["address", "poi"]
        if origin:
            calls.append(request_amap(client, "v3/place/around",
                                      {**location, "keywords": query, "radius": "50000", "sortrule": "distance",
                                       "offset": "25", "page": "1", "extensions": "base"}, config.web_key))
            fields.append("pois")
            sources.append("poi")
        responses = await asyncio.gather(*calls, return_exceptions=True)
        batches, failures = [], []
        for data, field, source in zip(responses, fields, sources):
            if isinstance(data, Exception):
                failures.append(data)
            else:
                batches.append((data.get(field, []), source))
        if not batches:
            raise failures[0]
    places, seen = [], set()
    for rows, source in batches:
        for row in rows if isinstance(rows, list) else []:
            p = place(row, source, query) if isinstance(row, dict) else None
            if not p:
                continue
            identity = (round(p["longitude"], 5), round(p["latitude"], 5), p["name"])
            if identity not in seen:
                seen.add(identity)
                places.append(p)
    if not places and failures:
        raise failures[0]
    if origin:
        for result in places:
            result["distance"] = distance(origin, result)
        places.sort(key=lambda result: result["distance"])
    return {"places": places[:20], "partial": bool(failures), "sortedByDistance": bool(origin)}
