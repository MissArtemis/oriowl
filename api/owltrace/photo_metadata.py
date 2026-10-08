import math
from datetime import datetime

import pillow_heif
from PIL import ExifTags, Image

pillow_heif.register_heif_opener()
FORMATS = {"JPEG": ("jpg", "image/jpeg"), "PNG": ("png", "image/png"),
           "WEBP": ("webp", "image/webp"), "HEIF": ("heic", "image/heic")}


def gps_coordinate(value, reference):
    if value is None:
        return None
    try:
        degrees, minutes, seconds = map(float, value)
        coordinate = degrees + minutes / 60 + seconds / 3600
        if reference in ("S", "W", b"S", b"W"):
            coordinate = -coordinate
        return coordinate if math.isfinite(coordinate) else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def metadata(path):
    with Image.open(path) as image:
        if image.format not in FORMATS:
            raise ValueError("请选择 JPG、PNG、WebP 或 HEIC 照片")
        extension, mime = FORMATS[image.format]
        exif = image.getexif()
        gps = exif.get_ifd(ExifTags.IFD.GPSInfo)
        lat = gps_coordinate(gps.get(2), gps.get(1))
        lng = gps_coordinate(gps.get(4), gps.get(3))
        result = {"width": image.width, "height": image.height, "mimeType": mime}
        if lat is not None and lng is not None and abs(lat) <= 90 and abs(lng) <= 180:
            result["gps"] = {"longitude": lng, "latitude": lat}
        date = exif.get_ifd(ExifTags.IFD.Exif).get(36867) or exif.get(306)
        if date:
            try:
                result["capturedAt"] = datetime.strptime(str(date), "%Y:%m:%d %H:%M:%S").isoformat()
            except ValueError:
                pass
        image.verify()
    return result, extension
