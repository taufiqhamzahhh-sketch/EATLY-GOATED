"""EATLY Phase 2/3 tests: Orders (server-side price + status), Reviews, Notifications."""
import time
import requests
import pytest


# ---- helpers -------------------------------------------------------------
def _pick_menu(base_url, name_hint):
    restos = requests.get(f"{base_url}/api/restaurants").json()
    # Warung Sinar Bahagia has Rendang / Nasi Goreng with required spice/nasi options
    warung = next(r for r in restos if "Warung Sinar Bahagia" in r["name"])
    menu = requests.get(f"{base_url}/api/restaurants/{warung['id']}/menu").json()
    item = next(m for m in menu if name_hint.lower() in m["name"].lower())
    return warung, menu, item


def _valid_line(item, qty=1):
    """Build an OrderItemIn payload that satisfies the required option groups on Warung menu."""
    opts = []
    for g in item.get("options", []):
        if g.get("required"):
            choice = g["choices"][0]["name"]  # pick a delta-0 choice
            opts.append({"group": g["name"], "choice": choice})
    return {"menu_item_id": item["id"], "quantity": qty, "options": opts, "notes": ""}


def _make_headers(base_url, email=None, password="password123"):
    email = email or "andi@eatly.com"
    r = requests.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


# ---- Orders --------------------------------------------------------------
class TestOrders:
    def test_create_order_requires_auth(self, base_url):
        r = requests.post(f"{base_url}/api/orders", json={})
        assert r.status_code in (401, 422)

    def test_create_order_promo_hemat10_price_math(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"],
            "items": [_valid_line(nasgor, qty=2)],
            "dine_in": {"table": "Meja 5", "time": "19:00"},
            "payment_method": "qris",
            "promo_code": "HEMAT10",
        }
        r = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers)
        assert r.status_code == 200, r.text
        o = r.json()
        # 2 x 45000 = 90000; -10000 = 80000
        assert o["subtotal"] == 90000
        assert o["discount"] == 10000
        assert o["total"] == 80000
        assert o["status"] == "paid"
        assert o["promoCode"] == "HEMAT10"
        assert o["paymentMethod"] == "qris"
        assert o["qrToken"].startswith("EATLY|")
        assert o["cancellableUntil"] > 0
        # persistence check
        got = requests.get(f"{base_url}/api/orders/{o['id']}", headers=auth_headers)
        assert got.status_code == 200
        assert got.json()["id"] == o["id"]

    def test_missing_required_option_rejected(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        line = {"menu_item_id": nasgor["id"], "quantity": 1, "options": [], "notes": ""}
        payload = {
            "restaurant_id": warung["id"], "items": [line],
            "dine_in": {"table": "M1", "time": "20:00"},
            "payment_method": "qris",
        }
        r = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers)
        assert r.status_code == 400
        assert "wajib" in r.json().get("detail", "").lower()

    def test_invalid_payment_method(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"},
            "payment_method": "bitcoin",
        }
        r = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers)
        assert r.status_code == 400

    def test_promo_eatly25_min_subtotal_enforced(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        # 1 x 45000 < 100000 — must fail
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor, qty=1)],
            "dine_in": {"table": "M1", "time": "20:00"},
            "payment_method": "qris",
            "promo_code": "EATLY25",
        }
        r = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers)
        assert r.status_code == 400
        assert "min" in r.json().get("detail", "").lower()

    def test_invalid_promo_rejected(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"},
            "payment_method": "qris",
            "promo_code": "FAKECODE",
        }
        r = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers)
        assert r.status_code == 400

    def test_cancel_within_window(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "cash",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        c = requests.post(f"{base_url}/api/orders/{o['id']}/cancel", headers=auth_headers)
        assert c.status_code == 200, c.text
        assert c.json()["status"] == "cancelled"

    def test_cancel_after_window_fails(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "cash",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        time.sleep(6)  # past 5s window
        c = requests.post(f"{base_url}/api/orders/{o['id']}/cancel", headers=auth_headers)
        assert c.status_code == 400

    def test_complete_only_when_ready(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "qris",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        # immediate complete should fail (status == paid)
        r = requests.post(f"{base_url}/api/orders/{o['id']}/complete", headers=auth_headers)
        assert r.status_code == 400

    @pytest.mark.slow
    def test_status_progression_and_complete(self, base_url, auth_headers):
        """paid -> preparing after 10s -> ready after 25s, then can complete."""
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "qris",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        # After ~12s expect preparing
        time.sleep(12)
        st = requests.get(f"{base_url}/api/orders/{o['id']}", headers=auth_headers).json()["status"]
        assert st in ("preparing", "ready"), f"expected preparing at ~12s, got {st}"
        # After ~28s total expect ready
        time.sleep(16)
        st = requests.get(f"{base_url}/api/orders/{o['id']}", headers=auth_headers).json()["status"]
        assert st == "ready", f"expected ready at ~28s, got {st}"
        # Complete
        c = requests.post(f"{base_url}/api/orders/{o['id']}/complete", headers=auth_headers)
        assert c.status_code == 200, c.text
        assert c.json()["status"] == "completed"
        return o["id"]


# ---- Reviews -------------------------------------------------------------
class TestReviews:
    def test_review_requires_completed_order(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "cash",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        r = requests.post(
            f"{base_url}/api/reviews",
            json={"order_id": o["id"], "rating": 5, "comment": "TEST_bagus"},
            headers=auth_headers,
        )
        assert r.status_code == 400  # not completed

    @pytest.mark.slow
    def test_review_completed_order_updates_rating(self, base_url, auth_headers):
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "qris",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()
        time.sleep(28)  # ensure ready
        requests.post(f"{base_url}/api/orders/{o['id']}/complete", headers=auth_headers)

        before = requests.get(f"{base_url}/api/restaurants/{warung['id']}").json()
        r = requests.post(
            f"{base_url}/api/reviews",
            json={"order_id": o["id"], "rating": 5, "comment": "TEST_mantap"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        after = requests.get(f"{base_url}/api/restaurants/{warung['id']}").json()
        assert after["review_count"] == before["review_count"] + 1

        # Duplicate review rejected
        r2 = requests.post(
            f"{base_url}/api/reviews",
            json={"order_id": o["id"], "rating": 4, "comment": "TEST_dup"},
            headers=auth_headers,
        )
        assert r2.status_code == 409

        # Public reviews list contains our comment
        reviews = requests.get(f"{base_url}/api/restaurants/{warung['id']}/reviews").json()
        assert any(rv.get("comment") == "TEST_mantap" for rv in reviews)


# ---- Notifications -------------------------------------------------------
class TestNotifications:
    def test_notifications_flow(self, base_url, auth_headers):
        # Create a fresh order -> should produce a "Pembayaran berhasil" notification
        warung, _, nasgor = _pick_menu(base_url, "Nasi Goreng")
        payload = {
            "restaurant_id": warung["id"], "items": [_valid_line(nasgor)],
            "dine_in": {"table": "M1", "time": "20:00"}, "payment_method": "qris",
        }
        o = requests.post(f"{base_url}/api/orders", json=payload, headers=auth_headers).json()

        notifs = requests.get(f"{base_url}/api/notifications", headers=auth_headers).json()
        assert isinstance(notifs, list) and len(notifs) >= 1
        assert any(n["orderId"] == o["id"] and "Pembayaran" in n["title"] for n in notifs)
        for n in notifs:
            assert "id" in n and "createdAt" in n and isinstance(n["read"], bool)

        # Unread count > 0
        uc = requests.get(f"{base_url}/api/notifications/unread-count", headers=auth_headers).json()
        assert uc["count"] >= 1

        # Mark all read -> unread-count becomes 0
        r = requests.post(f"{base_url}/api/notifications/read-all", headers=auth_headers)
        assert r.status_code == 200
        uc2 = requests.get(f"{base_url}/api/notifications/unread-count", headers=auth_headers).json()
        assert uc2["count"] == 0
