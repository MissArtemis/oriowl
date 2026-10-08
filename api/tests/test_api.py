import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi.testclient import TestClient

from owltrace.config import Config
from owltrace.main import app

CONFIG = Config(js_key="a" * 32, js_secret="b" * 32, web_key="c" * 32)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.config = patch("owltrace.maps.read_config", return_value=CONFIG)
        self.config.start()
        self.client = TestClient(app)
        self.client.__enter__()
        self.upstreams = []

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.config.stop()

    def mock(self, handler):
        async def respond(request):
            self.upstreams.append(request)
            return handler(request)
        self.client.app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(respond))

    def test_public_configuration_never_exposes_rest_key_or_secret(self):
        for route in ("/health", "/map/config", "/openapi.json"):
            response = self.client.get(route)
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(CONFIG.js_secret, response.text)
            self.assertNotIn(CONFIG.web_key, response.text)
        self.assertEqual(self.client.get("/health").json()["backend"], "fastapi")

    def test_proxy_replaces_credentials_and_redacts_upstream_diagnostics(self):
        self.mock(lambda request: httpx.Response(200, text=f"cb({CONFIG.js_secret})", headers={"Content-Type": "application/javascript"}))
        response = self.client.get("/_AMapService/v3/geocode/regeo?key=evil&jscode=evil&callback=cb")
        self.assertEqual(response.text, "cb([redacted])")
        params = parse_qs(urlsplit(str(self.upstreams[0].url)).query)
        self.assertEqual(params["key"], [CONFIG.js_key])
        self.assertEqual(params["jscode"], [CONFIG.js_secret])
        self.assertEqual(self.upstreams[0].url.host, "restapi.amap.com")

    def test_proxy_rejects_unsafe_paths_callbacks_and_redirects(self):
        self.mock(lambda request: httpx.Response(302, headers={"Location": "https://other.example"}))
        for path in ("https://other.example", "v3/geocode/regeo?callback=alert(1)", "v3/../../other"):
            self.assertIn(self.client.get("/_AMapService/" + path).status_code, (400, 404))
        self.assertEqual(len(self.upstreams), 0)
        self.assertEqual(self.client.get("/_AMapService/v3/geocode/regeo").status_code, 502)

    def test_address_search_merges_geocodes_and_pois_and_skips_invalid_coordinates(self):
        def handler(request):
            self.assertEqual(request.url.params["key"], CONFIG.web_key)
            if request.url.path.endswith("geo"):
                return httpx.Response(200, json={"status": "1", "geocodes": [{"location": "120.1,30.2", "formatted_address": "杭州市西湖区文三路", "city": []}]})
            return httpx.Response(200, json={"status": "1", "pois": [{"location": "120.2,30.3", "name": "小店", "address": []}, {"location": "NaN,30", "name": "坏数据"}]})
        self.mock(handler)
        response = self.client.get("/api/places/search", params={"q": "杭州市西湖区文三路"})
        places = response.json()["places"]
        self.assertEqual([p["source"] for p in places], ["address", "poi"])
        self.assertEqual(places[0]["name"], "杭州市西湖区文三路")
        self.assertEqual(places[1]["address"], "")
        self.assertNotIn(CONFIG.web_key, response.text)
        sorted_response = self.client.get("/api/places/search", params={"q": "小店", "longitude": 120.2, "latitude": 30.3}).json()
        self.assertTrue(sorted_response["sortedByDistance"])
        self.assertEqual(sorted_response["places"][0]["name"], "小店")
        self.assertEqual(sorted_response["places"][0]["distance"], 0)

    def test_search_preserves_partial_success_and_reports_authorization_failure(self):
        self.mock(lambda request: httpx.Response(200, json={"status": "0", "infocode": "10001", "info": CONFIG.web_key}))
        response = self.client.get("/api/places/search?q=西湖")
        self.assertEqual(response.status_code, 502)
        self.assertNotIn(CONFIG.web_key, response.text)
        self.mock(lambda request: httpx.Response(200, json={"status": "0", "infocode": "10003"}) if request.url.path.endswith("geo") else httpx.Response(200, json={"status": "1", "pois": [{"name": "西湖", "location": "120,30"}]}))
        response = self.client.get("/api/places/search?q=西湖")
        self.assertTrue(response.json()["partial"])
        self.assertEqual(len(response.json()["places"]), 1)

    def test_suggestions_filter_unlocated_keywords_and_validate_input(self):
        self.mock(lambda request: httpx.Response(200, json={"status": "1", "tips": [{"name": "西湖", "location": "120,30", "district": "杭州"}, {"name": "西湖区", "location": []}]}))
        self.assertEqual(len(self.client.get("/api/places/suggest?q=西湖").json()["places"]), 1)
        self.assertEqual(self.client.get("/api/places/search?q=%20").status_code, 400)
        self.assertEqual(self.client.get("/api/places/search?q=" + "x" * 121).status_code, 422)

    def test_gps_conversion_and_reverse_address_use_the_rest_key(self):
        def handler(request):
            self.assertEqual(request.url.params["key"], CONFIG.web_key)
            if request.url.path.endswith("convert"):
                self.assertEqual(request.url.params["coordsys"], "gps")
                self.assertEqual(request.url.params["locations"], "120.000000,30.000000")
                return httpx.Response(200, json={"status": "1", "locations": "120.0046,29.9975"})
            return httpx.Response(200, json={"status": "1", "regeocode": {"formatted_address": "浙江省杭州市", "addressComponent": {"city": [], "province": "浙江省", "district": "西湖区"}}})
        self.mock(handler)
        response = self.client.get("/api/coordinates/convert?longitude=120&latitude=30")
        self.assertEqual(response.json()["place"]["longitude"], 120.0046)
        self.assertEqual(response.json()["place"]["name"], "我的当前位置")
        self.assertNotIn(CONFIG.web_key, response.text)
        self.assertEqual(self.client.get("/api/places/reverse?longitude=120.0046&latitude=29.9975").json()["city"], "浙江省")
        self.assertEqual(self.client.get("/api/coordinates/convert?longitude=NaN&latitude=30").status_code, 422)


if __name__ == "__main__":
    unittest.main()
