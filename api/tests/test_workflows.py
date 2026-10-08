import io
import os
import tempfile
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from PIL import Image

from owltrace.config import Config
from owltrace.main import app


def gps_photo():
    output = io.BytesIO()
    exif = Image.Exif()
    exif[34853] = {1: "N", 2: (30, 12, 0), 3: "E", 4: (120, 6, 0)}
    exif[34665] = {36867: "2026:10:08 10:30:00"}
    Image.new("RGB", (48, 36), "#208b91").save(output, "JPEG", exif=exif)
    return output.getvalue()


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.environment = patch.dict(os.environ, {"OWLTRACE_DATA_DIR": self.directory.name})
        self.environment.start()
        self.config = patch("owltrace.media.read_config", return_value=Config(web_key="c" * 32))
        self.config.start()
        self.client = TestClient(app)
        self.client.__enter__()
        self.client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(self.amap))
        self.alice = self.account("alice")
        self.bob = self.account("bob")

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.config.stop()
        self.environment.stop()
        self.directory.cleanup()

    def amap(self, request):
        if request.url.path.endswith("convert"):
            self.assertEqual(request.url.params["locations"], "120.100000,30.200000")
            return httpx.Response(200, json={"status": "1", "locations": "120.104,30.198"})
        return httpx.Response(200, json={"status": "1", "regeocode": {"formatted_address": "照片拍摄地点"}})

    def account(self, name):
        response = self.client.post("/api/auth/register", json={"username": name, "password": "fixture-password", "nickname": name})
        self.assertEqual(response.status_code, 201)
        return response.json()

    def headers(self, account):
        return {"Authorization": "Bearer " + account["token"]}

    def test_original_photo_exif_private_note_and_server_recovery(self):
        original = gps_photo()
        response = self.client.post("/api/photos", files={"file": ("gps.jpg", original, "image/jpeg")}, headers=self.headers(self.alice))
        self.assertEqual(response.status_code, 201, response.text)
        photo = response.json()
        self.assertAlmostEqual(photo["gps"]["latitude"], 30.2)
        self.assertEqual(photo["place"]["longitude"], 120.104)
        self.assertEqual(photo["capturedAt"], "2026-10-08T10:30:00")
        draft = {"title": "拍摄地点的笔记", "body": "照片与文字一起发布", "place": photo["place"],
                 "photoIds": [photo["id"]], "category": "风景", "visibility": "private"}
        route = "/api/notes/recovery-fixture"
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.get(photo["remotePath"]).status_code, 404)
        self.assertEqual(self.client.get(route, headers=self.headers(self.bob)).status_code, 404)
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.bob)).status_code, 403)
        self.assertEqual(self.client.get("/api/notes/feed").json(), [])
        self.assertEqual(self.client.put("/api/notes/stolen", json=draft, headers=self.headers(self.bob)).status_code, 400)
        # Reload the application against the same data folder, like a server restart.
        self.client.__exit__(None, None, None)
        self.client = TestClient(app)
        self.client.__enter__()
        restored = self.client.get("/api/notes/mine", headers=self.headers(self.alice)).json()[0]
        self.assertEqual(restored["photos"][0]["id"], photo["id"])
        self.assertEqual(self.client.get(photo["remotePath"], headers=self.headers(self.alice)).content, original)
        draft["visibility"] = "public"
        self.client.put(route, json=draft, headers=self.headers(self.alice))
        self.assertEqual(self.client.get("/api/notes/feed").json()[0]["author"]["id"], self.alice["user"]["id"])
        self.assertEqual(self.client.get(photo["remotePath"]).content, original)

    def test_friend_acceptance_two_way_messages_and_session_revocation(self):
        peer = self.bob["user"]["id"]
        route = "/api/messages/" + peer
        self.assertEqual(self.client.post(route, json={"body": "不能越过好友关系"}, headers=self.headers(self.alice)).status_code, 403)
        self.client.post("/api/friends/requests", json={"userId": peer}, headers=self.headers(self.alice))
        incoming = self.client.get("/api/friends/requests", headers=self.headers(self.bob)).json()[0]
        accept = "/api/friends/requests/" + incoming["id"] + "/accept"
        self.assertEqual(self.client.post(accept, headers=self.headers(self.alice)).status_code, 404)
        self.assertEqual(self.client.post(accept, headers=self.headers(self.bob)).status_code, 200)
        self.assertEqual(self.client.post(route, json={"body": "你好，旅人"}, headers=self.headers(self.alice)).status_code, 201)
        self.assertEqual(self.client.get("/api/conversations", headers=self.headers(self.bob)).json()[0]["unread"], 1)
        reverse = "/api/messages/" + self.alice["user"]["id"]
        self.assertEqual(self.client.get(reverse, headers=self.headers(self.bob)).json()["messages"][0]["body"], "你好，旅人")
        self.client.post(reverse, json={"body": "明天一起出发"}, headers=self.headers(self.bob))
        self.assertEqual([m["body"] for m in self.client.get(route, headers=self.headers(self.alice)).json()["messages"]], ["你好，旅人", "明天一起出发"])
        self.assertEqual(self.client.get("/api/conversations", headers=self.headers(self.bob)).json()[0]["unread"], 0)
        self.client.post("/api/auth/logout", headers=self.headers(self.alice))
        self.assertEqual(self.client.get("/api/auth/me", headers=self.headers(self.alice)).status_code, 401)
        login = self.client.post("/api/auth/login", json={"username": "alice", "password": "fixture-password"}).json()
        self.assertEqual(len(self.client.get(route, headers=self.headers(login)).json()["messages"]), 2)

    def test_delete_hides_note_and_public_photo_survives_restart_and_can_restore(self):
        photo = self.client.post("/api/photos", files={"file": ("gps.jpg", gps_photo(), "image/jpeg")},
                                 headers=self.headers(self.alice)).json()
        draft = {"title": "删除联调", "body": "测试笔记", "place": photo["place"], "photoIds": [photo["id"]],
                 "category": "风景", "visibility": "public"}
        route = "/api/notes/delete-fixture"
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.delete(route, headers=self.headers(self.bob)).status_code, 403)
        self.assertEqual(self.client.post(route + "/restore", headers=self.headers(self.bob)).status_code, 403)
        self.assertEqual(self.client.get(photo["remotePath"]).status_code, 200)
        self.assertEqual(self.client.delete(route, headers=self.headers(self.alice)).json(), {"deleted": True, "hasBackup": True})
        self.assertEqual(self.client.delete(route, headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.get(route, headers=self.headers(self.alice)).status_code, 404)
        self.assertEqual(self.client.get("/api/notes/mine", headers=self.headers(self.alice)).json(), [])
        self.assertEqual(self.client.get("/api/notes/feed").json(), [])
        self.assertEqual(self.client.get(photo["remotePath"]).status_code, 404)
        self.assertEqual(self.client.get(photo["remotePath"], headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.alice)).status_code, 410)
        self.client.__exit__(None, None, None)
        self.client = TestClient(app)
        self.client.__enter__()
        trash = self.client.get("/api/notes/trash", headers=self.headers(self.alice)).json()
        self.assertEqual(trash[0]["id"], "delete-fixture")
        self.assertTrue(trash[0]["deletedAt"])
        self.assertTrue(trash[0]["deletionBackup"])
        self.assertEqual(self.client.post(route + "/restore", headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.get(route).status_code, 200)
        self.assertEqual(self.client.get(photo["remotePath"]).status_code, 200)
        self.assertEqual(self.client.get("/api/notes/trash", headers=self.headers(self.alice)).json(), [])

    def test_offline_delete_prevents_a_late_upload_from_recreating_a_note(self):
        route = "/api/notes/not-yet-uploaded"
        draft = {"title": "本地删除", "body": "未上传正文", "place": {"name": "测试地点", "longitude": 120, "latitude": 30},
                 "photoIds": [], "category": "日常", "visibility": "private"}
        self.assertEqual(self.client.delete(route, headers=self.headers(self.alice)).json(), {"deleted": True, "hasBackup": False})
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.alice)).status_code, 410)
        self.assertEqual(self.client.post(route + "/restore", headers=self.headers(self.alice)).status_code, 200)
        self.assertEqual(self.client.put(route, json=draft, headers=self.headers(self.alice)).status_code, 200)
        preflight = self.client.options(route, headers={"Origin": "http://localhost:8081", "Access-Control-Request-Method": "DELETE"})
        self.assertEqual(preflight.status_code, 200)
        self.assertIn("DELETE", preflight.headers["access-control-allow-methods"])
