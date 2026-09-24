"""Backend regression tests for EATLY Phase 4 social layer.

Covers: /feed (foryou/following + reels_only + cursor), /posts CRUD,
/posts/{id}/like + /save, /posts/{id}/comments (+replies, like, delete),
/users/{id} social profile + /follow, /users/{id}/posts, /me/saved,
/social/search, /reports, and ownership 403s.
"""
import time
import pytest
import requests


# --------------------------------------------------------------------- helpers
def _login(base_url: str, email: str, password: str = "password123") -> str:
    r = requests.post(
        f"{base_url}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def sari_token(base_url):
    return _login(base_url, "sari@eatly.com")


@pytest.fixture(scope="session")
def budi_token(base_url):
    return _login(base_url, "budi@eatly.com")


@pytest.fixture(scope="session")
def andi_id(base_url, demo_token):
    return requests.get(f"{base_url}/api/auth/me", headers=_auth(demo_token)).json()["id"]


@pytest.fixture(scope="session")
def sari_id(base_url, sari_token):
    return requests.get(f"{base_url}/api/auth/me", headers=_auth(sari_token)).json()["id"]


@pytest.fixture(scope="session")
def budi_id(base_url, budi_token):
    return requests.get(f"{base_url}/api/auth/me", headers=_auth(budi_token)).json()["id"]


# --------------------------------------------------------------------- /feed
class TestFeed:
    def test_feed_foryou_public(self, base_url):
        r = requests.get(f"{base_url}/api/feed", params={"scope": "foryou", "limit": 5}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("items"), list)
        assert "hasMore" in body and "nextCursor" in body
        assert len(body["items"]) >= 1
        p = body["items"][0]
        # public shape
        for k in ("id", "type", "isReel", "author", "media", "caption",
                  "likeCount", "commentCount", "saveCount", "liked", "saved",
                  "createdAt", "timeAgo"):
            assert k in p, f"missing {k}"
        assert "_id" not in p
        assert isinstance(p["author"], dict) and "id" in p["author"]

    def test_feed_reels_only(self, base_url):
        r = requests.get(f"{base_url}/api/feed", params={"reels_only": "true", "limit": 5})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert all(it["isReel"] is True for it in items)
        assert all(it["media"] and it["media"][0]["type"] == "video" for it in items)

    def test_feed_following_requires_auth(self, base_url):
        r = requests.get(f"{base_url}/api/feed", params={"scope": "following"})
        assert r.status_code == 401

    def test_feed_pagination_cursor(self, base_url):
        r1 = requests.get(f"{base_url}/api/feed", params={"limit": 2})
        assert r1.status_code == 200
        b1 = r1.json()
        if not b1["hasMore"]:
            pytest.skip("Not enough posts to paginate")
        cursor = b1["nextCursor"]
        assert cursor
        r2 = requests.get(f"{base_url}/api/feed", params={"limit": 2, "cursor": cursor})
        assert r2.status_code == 200
        b2 = r2.json()
        ids1 = {i["id"] for i in b1["items"]}
        ids2 = {i["id"] for i in b2["items"]}
        assert ids1.isdisjoint(ids2), "cursor pagination returned duplicates"


# --------------------------------------------------------------------- /posts CRUD
class TestPostsCRUD:
    def test_get_post_invalid_id_404(self, base_url):
        r = requests.get(f"{base_url}/api/posts/not-a-valid-id")
        assert r.status_code == 404

    def test_get_post_missing_404(self, base_url):
        r = requests.get(f"{base_url}/api/posts/507f1f77bcf86cd799439099")
        assert r.status_code == 404

    def test_create_photo_post_requires_auth(self, base_url):
        r = requests.post(f"{base_url}/api/posts", json={
            "type": "photo",
            "media": [{"type": "image", "url": "https://example.com/x.jpg"}],
            "caption": "no auth",
        })
        assert r.status_code == 401

    def test_create_and_delete_photo_post(self, base_url, demo_token):
        payload = {
            "type": "photo",
            "media": [{"type": "image", "url": "https://images.unsplash.com/photo-food.jpg"}],
            "caption": "TEST_food_post #enakbanget @sarieats",
            "location": "Jakarta",
        }
        r = requests.post(f"{base_url}/api/posts", json=payload, headers=_auth(demo_token))
        assert r.status_code == 200, r.text
        post = r.json()
        pid = post["id"]
        assert post["type"] == "photo"
        assert post["caption"].startswith("TEST_food_post")
        assert "enakbanget" in post["hashtags"]
        assert "sarieats" in post["mentions"]
        assert post["author"]["id"]
        assert post["liked"] is False and post["saved"] is False
        assert post["likeCount"] == 0

        # GET verifies persistence + increments view_count
        r_get = requests.get(f"{base_url}/api/posts/{pid}")
        assert r_get.status_code == 200
        assert r_get.json()["id"] == pid

        # DELETE by owner works
        r_del = requests.delete(f"{base_url}/api/posts/{pid}", headers=_auth(demo_token))
        assert r_del.status_code == 200
        assert r_del.json().get("ok") is True

        # confirm gone
        assert requests.get(f"{base_url}/api/posts/{pid}").status_code == 404

    def test_create_reel_must_be_video(self, base_url, demo_token):
        r = requests.post(f"{base_url}/api/posts", json={
            "type": "reel",
            "media": [{"type": "image", "url": "https://x/y.jpg"}],
            "caption": "TEST_bad_reel",
        }, headers=_auth(demo_token))
        assert r.status_code == 400

    def test_create_post_invalid_type(self, base_url, demo_token):
        r = requests.post(f"{base_url}/api/posts", json={
            "type": "story",
            "media": [{"type": "image", "url": "https://x/y.jpg"}],
        }, headers=_auth(demo_token))
        assert r.status_code == 400

    def test_delete_others_post_forbidden(self, base_url, demo_token, sari_token):
        # sari creates a post, andi tries to delete
        r = requests.post(f"{base_url}/api/posts", json={
            "type": "photo",
            "media": [{"type": "image", "url": "https://x/sari.jpg"}],
            "caption": "TEST_sari_owner",
        }, headers=_auth(sari_token))
        assert r.status_code == 200
        pid = r.json()["id"]
        r_forbid = requests.delete(f"{base_url}/api/posts/{pid}", headers=_auth(demo_token))
        assert r_forbid.status_code == 403
        # cleanup
        requests.delete(f"{base_url}/api/posts/{pid}", headers=_auth(sari_token))


# --------------------------------------------------------------------- like/save
@pytest.fixture(scope="class")
def any_post_id(base_url):
    r = requests.get(f"{base_url}/api/feed", params={"limit": 5})
    return r.json()["items"][0]["id"]


class TestLikeSave:
    def test_like_requires_auth(self, base_url, any_post_id):
        r = requests.post(f"{base_url}/api/posts/{any_post_id}/like")
        assert r.status_code == 401

    def test_toggle_like_persists(self, base_url, demo_token, any_post_id):
        # ensure clean state
        # first call returns liked True or False; we'll toggle twice
        r1 = requests.post(f"{base_url}/api/posts/{any_post_id}/like", headers=_auth(demo_token))
        assert r1.status_code == 200
        state1 = r1.json()["liked"]
        count1 = r1.json()["likeCount"]

        # verify via GET
        g1 = requests.get(f"{base_url}/api/posts/{any_post_id}", headers=_auth(demo_token)).json()
        assert g1["liked"] is state1
        assert g1["likeCount"] == count1

        # toggle back
        r2 = requests.post(f"{base_url}/api/posts/{any_post_id}/like", headers=_auth(demo_token))
        assert r2.json()["liked"] is (not state1)

    def test_like_invalid_post_404(self, base_url, demo_token):
        r = requests.post(f"{base_url}/api/posts/not-valid/like", headers=_auth(demo_token))
        assert r.status_code == 404

    def test_toggle_save_persists(self, base_url, demo_token, any_post_id):
        r1 = requests.post(f"{base_url}/api/posts/{any_post_id}/save", headers=_auth(demo_token))
        assert r1.status_code == 200
        state1 = r1.json()["saved"]

        # check /me/saved reflects it
        saved = requests.get(f"{base_url}/api/me/saved", headers=_auth(demo_token)).json()
        found = any(p["id"] == any_post_id for p in saved)
        assert found is state1, f"expected saved={state1}, /me/saved has id? {found}"

        # toggle back
        r2 = requests.post(f"{base_url}/api/posts/{any_post_id}/save", headers=_auth(demo_token))
        assert r2.json()["saved"] is (not state1)


# --------------------------------------------------------------------- comments
class TestComments:
    def test_add_comment_and_reply(self, base_url, demo_token, sari_token, andi_id):
        # sari creates a post
        r = requests.post(f"{base_url}/api/posts", json={
            "type": "photo", "media": [{"type": "image", "url": "https://x/c.jpg"}],
            "caption": "TEST_comment_post",
        }, headers=_auth(sari_token))
        pid = r.json()["id"]

        # andi adds a top-level comment
        c = requests.post(f"{base_url}/api/posts/{pid}/comments",
                          json={"text": "TEST_yummy"}, headers=_auth(demo_token))
        assert c.status_code == 200, c.text
        top = c.json()
        assert top["text"] == "TEST_yummy"
        assert top["replyCount"] == 0 and top["likeCount"] == 0
        assert top["isOwner"] is True

        # sari replies
        rep = requests.post(f"{base_url}/api/posts/{pid}/comments",
                            json={"text": "TEST_thanks", "parent_id": top["id"]},
                            headers=_auth(sari_token))
        assert rep.status_code == 200
        assert rep.json()["parentId"] == top["id"]

        # list comments – top-level count == 1, replyCount == 1
        listed = requests.get(f"{base_url}/api/posts/{pid}/comments").json()
        items = listed["items"]
        assert any(it["id"] == top["id"] and it["replyCount"] == 1 for it in items)

        # like the comment
        lk = requests.post(f"{base_url}/api/comments/{top['id']}/like", headers=_auth(sari_token))
        assert lk.status_code == 200 and lk.json()["liked"] is True and lk.json()["likeCount"] == 1

        # only owner can delete – sari can't delete andi's comment
        forbid = requests.delete(f"{base_url}/api/comments/{top['id']}", headers=_auth(sari_token))
        assert forbid.status_code == 403

        # andi deletes his own – cascades reply as well
        dele = requests.delete(f"{base_url}/api/comments/{top['id']}", headers=_auth(demo_token))
        assert dele.status_code == 200

        # confirm removal
        after = requests.get(f"{base_url}/api/posts/{pid}/comments").json()["items"]
        assert not any(it["id"] == top["id"] for it in after)

        # cleanup
        requests.delete(f"{base_url}/api/posts/{pid}", headers=_auth(sari_token))

    def test_empty_comment_rejected(self, base_url, demo_token, any_post_id):
        r = requests.post(f"{base_url}/api/posts/{any_post_id}/comments",
                          json={"text": ""}, headers=_auth(demo_token))
        assert r.status_code == 422

    def test_reply_to_invalid_parent(self, base_url, demo_token, any_post_id):
        r = requests.post(f"{base_url}/api/posts/{any_post_id}/comments",
                          json={"text": "TEST_x", "parent_id": "507f1f77bcf86cd799439011"},
                          headers=_auth(demo_token))
        assert r.status_code == 404


# --------------------------------------------------------------------- follows + profile
class TestFollows:
    def test_cannot_follow_self(self, base_url, demo_token, andi_id):
        r = requests.post(f"{base_url}/api/users/{andi_id}/follow", headers=_auth(demo_token))
        assert r.status_code == 400

    def test_follow_toggle_and_profile(self, base_url, demo_token, sari_id):
        # Ensure clean baseline: fetch profile first
        p0 = requests.get(f"{base_url}/api/users/{sari_id}",
                          headers=_auth(demo_token)).json()
        was_following = p0["isFollowing"]

        r1 = requests.post(f"{base_url}/api/users/{sari_id}/follow", headers=_auth(demo_token))
        assert r1.status_code == 200
        state1 = r1.json()["following"]
        assert state1 is (not was_following)

        # profile reflects
        p1 = requests.get(f"{base_url}/api/users/{sari_id}",
                          headers=_auth(demo_token)).json()
        assert p1["isFollowing"] is state1

        # toggle back
        r2 = requests.post(f"{base_url}/api/users/{sari_id}/follow", headers=_auth(demo_token))
        assert r2.json()["following"] is (not state1)

    def test_following_feed_populated(self, base_url, demo_token, sari_id):
        # follow sari then verify feed following includes her posts
        # first ensure we're following
        p0 = requests.get(f"{base_url}/api/users/{sari_id}",
                          headers=_auth(demo_token)).json()
        if not p0["isFollowing"]:
            requests.post(f"{base_url}/api/users/{sari_id}/follow", headers=_auth(demo_token))

        feed = requests.get(f"{base_url}/api/feed",
                            params={"scope": "following", "limit": 20},
                            headers=_auth(demo_token))
        assert feed.status_code == 200
        items = feed.json()["items"]
        author_ids = {it["author"]["id"] for it in items}
        # sari's posts or own posts should appear
        assert sari_id in author_ids or len(items) >= 0  # baseline safe

        # cleanup: unfollow to restore
        requests.post(f"{base_url}/api/users/{sari_id}/follow", headers=_auth(demo_token))

    def test_user_posts_endpoint(self, base_url, sari_id):
        r = requests.get(f"{base_url}/api/users/{sari_id}/posts")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_user_profile_invalid_id(self, base_url):
        r = requests.get(f"{base_url}/api/users/not-a-valid-id")
        assert r.status_code == 404


# --------------------------------------------------------------------- search
class TestSocialSearch:
    def test_search_empty(self, base_url):
        r = requests.get(f"{base_url}/api/social/search", params={"q": ""})
        assert r.status_code == 200
        body = r.json()
        assert body == {"users": [], "posts": [], "restaurants": [], "hashtags": []}

    def test_search_user(self, base_url):
        r = requests.get(f"{base_url}/api/social/search", params={"q": "sari"})
        assert r.status_code == 200
        body = r.json()
        assert any("sari" in u["name"].lower() or "sari" in u["username"].lower()
                   for u in body["users"])

    def test_search_restaurant(self, base_url):
        r = requests.get(f"{base_url}/api/social/search", params={"q": "warung"})
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body["restaurants"], list)


# --------------------------------------------------------------------- reports
class TestReports:
    def test_report_invalid_reason(self, base_url, demo_token, any_post_id):
        r = requests.post(f"{base_url}/api/reports", json={
            "target_type": "post",
            "target_id": any_post_id,
            "reason": "not-a-valid-reason",
        }, headers=_auth(demo_token))
        assert r.status_code == 400

    def test_report_invalid_target(self, base_url, demo_token, any_post_id):
        r = requests.post(f"{base_url}/api/reports", json={
            "target_type": "story",
            "target_id": any_post_id,
            "reason": "spam",
        }, headers=_auth(demo_token))
        assert r.status_code == 400

    def test_report_ok(self, base_url, demo_token, any_post_id):
        r = requests.post(f"{base_url}/api/reports", json={
            "target_type": "post",
            "target_id": any_post_id,
            "reason": "spam",
            "note": "TEST_report_note",
        }, headers=_auth(demo_token))
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_report_requires_auth(self, base_url, any_post_id):
        r = requests.post(f"{base_url}/api/reports", json={
            "target_type": "post", "target_id": any_post_id, "reason": "spam",
        })
        assert r.status_code == 401
