import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, Response

from .amap import place, proxy_url, request_amap, search_places, string
from .config import API_ROOT, read_config

router = APIRouter(tags=["地图"])


@router.get("/health")
def health():
    config = read_config()
    return {"ok": True, "mapConfigured": config.map_configured, "searchConfigured": config.search_configured,
            "service": "oriowl-map-api", "backend": "fastapi"}


@router.get("/map", response_class=HTMLResponse)
def map_page():
    return (API_ROOT / "templates" / "map.html").read_text(encoding="utf-8")


@router.get("/map/script.js")
def map_script():
    return Response((API_ROOT / "templates" / "map.js").read_text(encoding="utf-8"), media_type="application/javascript")


@router.get("/map/config")
def map_config():
    config = read_config()
    # The JS identifier must be public for rendering. Both secrets and the REST key stay here.
    return {"configured": config.map_configured, "searchConfigured": config.search_configured,
            "key": config.js_key if config.map_configured else None}


@router.get("/_AMapService/{path:path}")
async def map_proxy(path: str, request: Request):
    config = read_config()
    if not config.map_configured:
        raise HTTPException(503, "地图尚未配置")
    url = proxy_url(path, list(request.query_params.multi_items()), config)
    try:
        upstream = await request.app.state.http.get(url)
        if 300 <= upstream.status_code < 400:
            raise HTTPException(502, "地图服务返回了无效响应")
        body = upstream.content.replace(config.js_secret.encode(), b"[redacted]")
        return Response(body, status_code=upstream.status_code, headers={"Content-Type": upstream.headers.get("content-type", "application/json")})
    except httpx.HTTPError:
        raise HTTPException(502, "地图服务暂时不可用，请检查网络后重试") from None


@router.get("/api/places/search")
async def search(request: Request, q: str = Query(min_length=1, max_length=120), city: str = Query(default="", max_length=60),
                 longitude: float | None = Query(default=None, ge=-180, le=180, allow_inf_nan=False),
                 latitude: float | None = Query(default=None, ge=-90, le=90, allow_inf_nan=False)):
    query = q.strip()
    if not query:
        raise HTTPException(400, "请输入地址或地点名称")
    if (longitude is None) != (latitude is None):
        raise HTTPException(400, "请同时提供经度和纬度")
    origin = (longitude, latitude) if longitude is not None else None
    return await search_places(request.app.state.http, read_config(), query, city.strip(), origin=origin)


@router.get("/api/places/suggest")
async def suggest(request: Request, q: str = Query(min_length=1, max_length=120), city: str = Query(default="", max_length=60),
                  longitude: float | None = Query(default=None, ge=-180, le=180, allow_inf_nan=False),
                  latitude: float | None = Query(default=None, ge=-90, le=90, allow_inf_nan=False)):
    query = q.strip()
    if not query:
        raise HTTPException(400, "请输入地址或地点名称")
    if (longitude is None) != (latitude is None):
        raise HTTPException(400, "请同时提供经度和纬度")
    origin = (longitude, latitude) if longitude is not None else None
    return await search_places(request.app.state.http, read_config(), query, city.strip(), suggest=True, origin=origin)


@router.get("/api/coordinates/convert")
async def convert_coordinates(request: Request, longitude: float = Query(ge=-180, le=180, allow_inf_nan=False), latitude: float = Query(ge=-90, le=90, allow_inf_nan=False)):
    config = read_config()
    if not config.search_configured:
        raise HTTPException(503, "请在后端配置 Web 服务 Key，以启用位置坐标转换")
    data = await request_amap(request.app.state.http, "v3/assistant/coordinate/convert", {"locations": f"{longitude:.6f},{latitude:.6f}", "coordsys": "gps"}, config.web_key)
    result = place({"location": data.get("locations"), "name": "我的当前位置"}, "address")
    if not result:
        raise HTTPException(502, "高德位置坐标转换失败，请稍后重试")
    return {"place": result}


@router.get("/api/places/reverse")
async def reverse_address(request: Request, longitude: float = Query(ge=-180, le=180, allow_inf_nan=False), latitude: float = Query(ge=-90, le=90, allow_inf_nan=False)):
    config = read_config()
    if not config.search_configured:
        raise HTTPException(503, "请在后端配置 Web 服务 Key，以启用地址回查")
    data = await request_amap(request.app.state.http, "v3/geocode/regeo", {"location": f"{longitude:.6f},{latitude:.6f}", "extensions": "base", "radius": "1000"}, config.web_key)
    result = data.get("regeocode")
    if not isinstance(result, dict):
        raise HTTPException(502, "高德没有返回此位置的地址")
    component = result.get("addressComponent") or {}
    if not isinstance(component, dict):
        component = {}
    return {"address": string(result.get("formatted_address")),
            "city": string(component.get("city")) or string(component.get("province")),
            "name": string(component.get("township")) or string(component.get("district")) or "地图上的一处风景"}
