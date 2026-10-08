import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageOps

from .amap import place, request_amap, string
from .auth import current_user, optional_user
from .config import read_config
from .db import data_root, database
from .models import Place
from .photo_metadata import metadata

router = APIRouter(tags=["照片"])


def photo_dto(row):
    info = json.loads(row["metadata"])
    path = "/api/media/" + row["id"]
    return {**info, "id": row["id"], "remotePath": path,
            **({"previewPath": path + "/preview"} if info["mimeType"] == "image/heic" else {})}


async def locate_photo(client, gps):
    config = read_config()
    converted = await request_amap(client, "v3/assistant/coordinate/convert",
                                   {"locations": f'{gps["longitude"]:.6f},{gps["latitude"]:.6f}',
                                    "coordsys": "gps"}, config.web_key)
    result = place({"location": converted.get("locations"), "name": "照片拍摄地点"}, "address")
    if not result:
        raise HTTPException(502, "照片坐标转换失败")
    try:
        address = await request_amap(client, "v3/geocode/regeo",
                                    {"location": f'{result["longitude"]:.6f},{result["latitude"]:.6f}',
                                     "extensions": "base"}, config.web_key)
        result["address"] = string(address.get("regeocode", {}).get("formatted_address"))
    except HTTPException:
        pass
    return Place.model_validate(result).model_dump()


@router.post("/api/photos", status_code=201)
async def upload_photo(request: Request, file: UploadFile = File(), gps: str = Form(default=""),
                       user=Depends(current_user)):
    directory = data_root() / "uploads"
    directory.mkdir(parents=True, exist_ok=True)
    photo_id = uuid.uuid4().hex
    path = directory / (photo_id + ".upload")
    try:
        size = 0
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > 30 * 1024 * 1024:
                    raise HTTPException(413, "单张照片不能超过 30 MB")
                output.write(chunk)
        try:
            info, extension = await run_in_threadpool(metadata, path)
        except Exception:
            raise HTTPException(400, "照片无法读取，请选择有效的 JPG、PNG、WebP 或 HEIC 文件") from None
        # Native photo-library location is useful when the picker strips EXIF GPS.
        if gps and "gps" not in info:
            try:
                coordinate = json.loads(gps)
                value = Place(**coordinate, name="")
                info["gps"] = {"longitude": value.longitude, "latitude": value.latitude}
            except (ValueError, TypeError):
                raise HTTPException(400, "照片位置格式不正确") from None
        if "gps" in info and read_config().search_configured:
            try:
                info["place"] = await locate_photo(request.app.state.http, info["gps"])
            except HTTPException:
                info["locationError"] = "拍摄坐标已读取，地址暂不可用，可手动选点"
        filename = photo_id + "." + extension
        path.rename(directory / filename)
        path = directory / filename
        with database() as connection:
            connection.execute("INSERT INTO media VALUES (?,?,?,?)",
                               (photo_id, user["id"], filename, json.dumps(info, ensure_ascii=False)))
        return photo_dto({"id": photo_id, "metadata": json.dumps(info)})
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


def accessible_photo(photo_id: str, user):
    with database() as connection:
        row = connection.execute("SELECT * FROM media WHERE id=?", (photo_id,)).fetchone()
        if not row:
            raise HTTPException(404, "服务器没有这张照片")
        public = connection.execute(
            "SELECT 1 FROM notes, json_each(notes.photo_ids) "
            "WHERE visibility='public' AND json_each.value=? "
            "AND NOT EXISTS (SELECT 1 FROM note_deletions WHERE note_id=notes.id) LIMIT 1", (photo_id,)
        ).fetchone()
        if not public and (not user or user["id"] != row["owner_id"]):
            raise HTTPException(404, "照片不可访问")
        path = data_root() / "uploads" / row["filename"]
        if not path.is_file():
            raise HTTPException(404, "服务端照片文件不存在")
        return path, json.loads(row["metadata"])["mimeType"]


@router.get("/api/media/{photo_id}")
def download_photo(photo_id: str, user=Depends(optional_user)):
    path, mime = accessible_photo(photo_id, user)
    return FileResponse(path, media_type=mime)


@router.get("/api/media/{photo_id}/preview")
def preview_photo(photo_id: str, user=Depends(optional_user)):
    path, mime = accessible_photo(photo_id, user)
    if mime != "image/heic":
        return FileResponse(path, media_type=mime)
    preview = path.with_suffix(".preview.jpg")
    if not preview.is_file():
        with Image.open(path) as image:
            picture = ImageOps.exif_transpose(image).convert("RGB")
            picture.thumbnail((1600, 1600))
            picture.save(preview, "JPEG", quality=88)
    return FileResponse(preview, media_type="image/jpeg")
