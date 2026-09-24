from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, BeforeValidator, ConfigDict
from typing import List, Optional, Annotated, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import bcrypt
import jwt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get('JWT_EXPIRE_MINUTES', '43200'))

app = FastAPI()
api_router = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------
def _validate_object_id(v: Any) -> str:
    if isinstance(v, ObjectId):
        return str(v)
    if isinstance(v, str):
        return v
    raise ValueError("Invalid ObjectId")


PyObjectId = Annotated[str, BeforeValidator(_validate_object_id)]


class BaseDocument(BaseModel):
    id: Optional[str] = None

    @classmethod
    def from_mongo(cls, doc: Optional[dict]):
        if not doc:
            return None
        data = dict(doc)
        if "_id" in data:
            data["id"] = str(data.pop("_id"))
        return cls(**data)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class OptionChoice(BaseModel):
    name: str
    price_delta: int = 0


class OptionGroup(BaseModel):
    name: str
    type: str = "single"  # "single" | "multi"
    required: bool = False
    choices: List[OptionChoice] = []


class MenuItem(BaseDocument):
    restaurant_id: str
    name: str
    description: str = ""
    price: int
    image: str = ""
    category: str = "Makanan Utama"
    tags: List[str] = []
    popular: bool = False
    available: bool = True
    options: List[OptionGroup] = []


class Restaurant(BaseDocument):
    name: str
    cuisine: str
    price_level: str = "Rp Rp"
    halal: bool = False
    rating: float = 0
    review_count: int = 0
    status: str = "buka"  # buka | tutup
    availability: str = "available"  # available | limited | full | closed
    description: str = ""
    tags: List[str] = []
    hero_image: str = ""
    avatar_image: str = ""
    estimate_min: int = 10
    estimate_max: int = 15
    distance_km: float = 1.0
    capacity_tables: int = 20
    community_rating: float = 0
    community_pick: bool = False
    address: str = ""
    open_hours: str = ""


class Reel(BaseDocument):
    restaurant_id: str
    restaurant_name: str
    user_name: str
    user_handle: str
    user_avatar: str = ""
    caption: str = ""
    thumb: str = ""
    duration: str = "0:30"
    views: int = 0
    rating: int = 5


class User(BaseDocument):
    email: str
    name: str
    username: str
    avatar_url: str = ""
    referral_code: str = ""
    total_orders: int = 0
    invited_friends: int = 0
    password_hash: str = ""
    created_at: str = ""


# ---------------------------------------------------------------------------
# Auth request/response
# ---------------------------------------------------------------------------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class PublicUser(BaseModel):
    id: str
    email: str
    name: str
    username: str
    avatar_url: str
    referral_code: str
    total_orders: int
    favorites_count: int
    invited_friends: int


class AuthResponse(BaseModel):
    token: str
    user: PublicUser


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_EXPIRE_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token tidak valid atau kedaluwarsa",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id or not ObjectId.is_valid(user_id):
            raise unauthorized
    except jwt.PyJWTError:
        raise unauthorized
    doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise unauthorized
    return doc


async def build_public_user(doc: dict) -> PublicUser:
    fav_count = await db.favorites.count_documents({"user_id": str(doc["_id"])})
    return PublicUser(
        id=str(doc["_id"]),
        email=doc["email"],
        name=doc["name"],
        username=doc.get("username", ""),
        avatar_url=doc.get("avatar_url", ""),
        referral_code=doc.get("referral_code", ""),
        total_orders=doc.get("total_orders", 0),
        favorites_count=fav_count,
        invited_friends=doc.get("invited_friends", 0),
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Email sudah terdaftar")
    base_username = email.split("@")[0]
    username = base_username
    if await db.users.find_one({"username": username}):
        username = f"{base_username}{int(datetime.now().timestamp()) % 10000}"
    first = body.name.strip().split(" ")[0].upper() if body.name.strip() else "EATLY"
    referral = f"{first}{datetime.now().year}"
    doc = {
        "email": email,
        "name": body.name.strip(),
        "username": username,
        "avatar_url": "https://i.pravatar.cc/300?img=13",
        "referral_code": referral,
        "total_orders": 0,
        "invited_friends": 0,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return AuthResponse(token=create_token(str(result.inserted_id)), user=await build_public_user(doc))


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(body: LoginIn):
    email = body.email.lower()
    doc = await db.users.find_one({"email": email})
    if not doc or not verify_password(body.password, doc.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email atau kata sandi salah")
    return AuthResponse(token=create_token(str(doc["_id"])), user=await build_public_user(doc))


@api_router.get("/auth/me", response_model=PublicUser)
async def me(current: dict = Depends(get_current_user)):
    return await build_public_user(current)


# ---------------------------------------------------------------------------
# Restaurant routes
# ---------------------------------------------------------------------------
@api_router.get("/restaurants", response_model=List[Restaurant])
async def list_restaurants(community: Optional[bool] = None, q: Optional[str] = None):
    query: dict = {}
    if community is True:
        query["community_pick"] = True
    if q:
        query["name"] = {"$regex": q, "$options": "i"}
    docs = await db.restaurants.find(query).to_list(200)
    return [Restaurant.from_mongo(d) for d in docs]


@api_router.get("/restaurants/{restaurant_id}", response_model=Restaurant)
async def get_restaurant(restaurant_id: str):
    if not ObjectId.is_valid(restaurant_id):
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    doc = await db.restaurants.find_one({"_id": ObjectId(restaurant_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    return Restaurant.from_mongo(doc)


@api_router.get("/restaurants/{restaurant_id}/menu", response_model=List[MenuItem])
async def get_menu(restaurant_id: str):
    docs = await db.menu_items.find({"restaurant_id": restaurant_id}).to_list(500)
    return [MenuItem.from_mongo(d) for d in docs]


@api_router.get("/reels", response_model=List[Reel])
async def list_reels():
    docs = await db.reels.find().to_list(100)
    return [Reel.from_mongo(d) for d in docs]


# ---------------------------------------------------------------------------
# Favorites routes
# ---------------------------------------------------------------------------
class ToggleFavoriteIn(BaseModel):
    restaurant_id: str


@api_router.get("/favorites", response_model=List[Restaurant])
async def list_favorites(current: dict = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": str(current["_id"])}).to_list(500)
    ids = [ObjectId(f["restaurant_id"]) for f in favs if ObjectId.is_valid(f["restaurant_id"])]
    if not ids:
        return []
    docs = await db.restaurants.find({"_id": {"$in": ids}}).to_list(500)
    return [Restaurant.from_mongo(d) for d in docs]


@api_router.get("/favorites/ids", response_model=List[str])
async def list_favorite_ids(current: dict = Depends(get_current_user)):
    favs = await db.favorites.find({"user_id": str(current["_id"])}).to_list(500)
    return [f["restaurant_id"] for f in favs]


@api_router.post("/favorites/toggle")
async def toggle_favorite(body: ToggleFavoriteIn, current: dict = Depends(get_current_user)):
    uid = str(current["_id"])
    existing = await db.favorites.find_one({"user_id": uid, "restaurant_id": body.restaurant_id})
    if existing:
        await db.favorites.delete_one({"_id": existing["_id"]})
        return {"favorited": False}
    await db.favorites.insert_one({"user_id": uid, "restaurant_id": body.restaurant_id})
    return {"favorited": True}


@api_router.get("/")
async def root():
    return {"message": "Eatly API"}


# ---------------------------------------------------------------------------
# Orders — server-side price validation, status flow, cancellation rules
# ---------------------------------------------------------------------------
CANCEL_WINDOW_SECONDS = 5           # user may cancel only within 5s of creation
PAID_UNTIL_SECONDS = 10             # paid -> preparing after 10s
PREPARING_UNTIL_SECONDS = 25        # preparing -> ready after 25s
STATUS_RANK = {"paid": 0, "preparing": 1, "ready": 2, "completed": 3, "cancelled": -1}

# Mirror of the client promo table — the SERVER is the source of truth.
PROMOS = {
    "NEWFAM": {"discount": 15000, "min_subtotal": 0, "label": "Diskon Rp 15.000"},
    "EATLY25": {"discount": 25000, "min_subtotal": 100000, "label": "Diskon Rp 25.000"},
    "HEMAT10": {"discount": 10000, "min_subtotal": 0, "label": "Diskon Rp 10.000"},
}
PAYMENT_METHODS = {"qris", "gopay", "card", "cash"}


class OrderItemIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)
    options: List[dict] = []          # [{ "group": str, "choice": str }]
    notes: str = ""


class DineInIn(BaseModel):
    table: str
    time: str


class CreateOrderIn(BaseModel):
    restaurant_id: str
    items: List[OrderItemIn] = Field(min_length=1)
    dine_in: DineInIn
    payment_method: str
    promo_code: Optional[str] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(v) -> datetime:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return _now()


def _effective_status(status: str, created_at) -> str:
    """Deterministic time-based progression (no trust in client)."""
    if status in ("completed", "cancelled"):
        return status
    elapsed = (_now() - _parse_dt(created_at)).total_seconds()
    if elapsed >= PREPARING_UNTIL_SECONDS:
        target = "ready"
    elif elapsed >= PAID_UNTIL_SECONDS:
        target = "preparing"
    else:
        target = "paid"
    # never move backwards from an explicitly stored status
    return target if STATUS_RANK[target] > STATUS_RANK[status] else status


def _make_public_order(doc: dict) -> dict:
    items = []
    for i, it in enumerate(doc.get("items", [])):
        items.append({
            "lineId": it.get("line_id", f"{doc['_id']}-{i}"),
            "restaurantId": doc.get("restaurant_id", ""),
            "restaurantName": doc.get("restaurant_name", ""),
            "menuItemId": it.get("menu_item_id", ""),
            "name": it.get("name", ""),
            "image": it.get("image", ""),
            "basePrice": it.get("base_price", 0),
            "unitPrice": it.get("unit_price", 0),
            "quantity": it.get("quantity", 1),
            "options": it.get("options", []),
            "notes": it.get("notes", ""),
        })
    created_at = _parse_dt(doc.get("created_at"))
    return {
        "id": str(doc["_id"]),
        "code": doc.get("code", ""),
        "restaurantId": doc.get("restaurant_id", ""),
        "restaurantName": doc.get("restaurant_name", ""),
        "restaurantAvatar": doc.get("restaurant_avatar", ""),
        "items": items,
        "dineIn": {"table": doc.get("dine_in", {}).get("table", ""), "time": doc.get("dine_in", {}).get("time", "")},
        "paymentMethod": doc.get("payment_method", "qris"),
        "promoCode": doc.get("promo_code"),
        "subtotal": doc.get("subtotal", 0),
        "discount": doc.get("discount", 0),
        "total": doc.get("total", 0),
        "status": doc.get("status", "paid"),
        "qrToken": doc.get("qr_token", ""),
        "createdAt": int(created_at.timestamp() * 1000),
        "reviewed": bool(doc.get("reviewed", False)),
        "cancellableUntil": int((created_at.timestamp() + CANCEL_WINDOW_SECONDS) * 1000),
    }


async def _add_notification(user_id: str, title: str, body: str, order_id: str = "", ntype: str = "order"):
    await db.notifications.insert_one({
        "user_id": user_id,
        "title": title,
        "body": body,
        "order_id": order_id,
        "type": ntype,
        "read": False,
        "created_at": _now().isoformat(),
    })


STATUS_NOTIF = {
    "preparing": ("Pesanan sedang disiapkan", "Dapur mulai menyiapkan pesananmu."),
    "ready": ("Pesanan siap!", "Tunjukkan QR ke staf restoran untuk verifikasi."),
    "completed": ("Pesanan selesai", "Terima kasih! Jangan lupa beri ulasan."),
    "cancelled": ("Pesanan dibatalkan", "Pesananmu telah dibatalkan."),
}


async def _persist_status(doc: dict) -> dict:
    """Recompute + persist the time-based status; emit a notification on change."""
    eff = _effective_status(doc.get("status", "paid"), doc.get("created_at"))
    if eff != doc.get("status"):
        await db.orders.update_one({"_id": doc["_id"]}, {"$set": {"status": eff}})
        doc["status"] = eff
        if eff in STATUS_NOTIF:
            title, body = STATUS_NOTIF[eff]
            await _add_notification(str(doc["user_id"]), title, body, str(doc["_id"]))
    return doc


@api_router.post("/orders")
async def create_order(body: CreateOrderIn, current: dict = Depends(get_current_user)):
    if body.payment_method not in PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Metode pembayaran tidak valid")
    if not ObjectId.is_valid(body.restaurant_id):
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    resto = await db.restaurants.find_one({"_id": ObjectId(body.restaurant_id)})
    if not resto:
        raise HTTPException(status_code=404, detail="Restoran tidak ditemukan")
    if resto.get("status") == "tutup" or resto.get("availability") == "closed":
        raise HTTPException(status_code=400, detail="Restoran sedang tutup")

    snapshot_items = []
    subtotal = 0
    for line in body.items:
        if not ObjectId.is_valid(line.menu_item_id):
            raise HTTPException(status_code=400, detail="Menu tidak valid")
        mi = await db.menu_items.find_one({"_id": ObjectId(line.menu_item_id)})
        if not mi or mi.get("restaurant_id") != body.restaurant_id:
            raise HTTPException(status_code=400, detail="Menu tidak ditemukan di restoran ini")
        if not mi.get("available", True):
            raise HTTPException(status_code=400, detail=f"{mi.get('name','Menu')} sedang tidak tersedia")

        groups = mi.get("options", [])
        chosen = line.options or []
        # index chosen by group
        chosen_by_group: dict = {}
        for c in chosen:
            chosen_by_group.setdefault(c.get("group"), []).append(c.get("choice"))

        unit_price = mi.get("price", 0)
        resolved_options = []
        for g in groups:
            gname = g.get("name")
            gtype = g.get("type", "single")
            picks = chosen_by_group.get(gname, [])
            if g.get("required") and len(picks) == 0:
                raise HTTPException(status_code=400, detail=f"Pilihan '{gname}' wajib diisi")
            if gtype == "single" and len(picks) > 1:
                raise HTTPException(status_code=400, detail=f"Pilihan '{gname}' hanya boleh satu")
            valid_choices = {ch["name"]: ch.get("price_delta", 0) for ch in g.get("choices", [])}
            for pick in picks:
                if pick not in valid_choices:
                    raise HTTPException(status_code=400, detail=f"Pilihan '{pick}' tidak valid")
                delta = valid_choices[pick]
                unit_price += delta
                resolved_options.append({"group": gname, "choice": pick, "price_delta": delta})

        subtotal += unit_price * line.quantity
        snapshot_items.append({
            "line_id": f"{line.menu_item_id}-{len(snapshot_items)}",
            "menu_item_id": line.menu_item_id,
            "name": mi.get("name", ""),
            "image": mi.get("image", ""),
            "base_price": mi.get("price", 0),
            "unit_price": unit_price,
            "quantity": line.quantity,
            "options": resolved_options,
            "notes": (line.notes or "").strip()[:200],
        })

    # Promo (server-validated)
    discount = 0
    promo_code = None
    if body.promo_code and body.promo_code.strip():
        key = body.promo_code.strip().upper()
        promo = PROMOS.get(key)
        if not promo:
            raise HTTPException(status_code=400, detail="Kode promo tidak valid")
        if subtotal < promo["min_subtotal"]:
            raise HTTPException(status_code=400, detail=f"Min. pembelian Rp {promo['min_subtotal']:,}".replace(",", "."))
        discount = min(promo["discount"], subtotal)
        promo_code = key

    total = max(0, subtotal - discount)
    now = _now()
    code = f"ETL-{int(now.timestamp()) % 10000:04d}"
    order_doc = {
        "user_id": str(current["_id"]),
        "code": code,
        "restaurant_id": body.restaurant_id,
        "restaurant_name": resto.get("name", ""),
        "restaurant_avatar": resto.get("avatar_image", ""),
        "items": snapshot_items,
        "dine_in": {"table": body.dine_in.table, "time": body.dine_in.time},
        "payment_method": body.payment_method,
        "promo_code": promo_code,
        "subtotal": subtotal,
        "discount": discount,
        "total": total,
        "status": "paid",
        "qr_token": f"EATLY|{code}|{int(now.timestamp())}",
        "reviewed": False,
        "created_at": now.isoformat(),
    }
    res = await db.orders.insert_one(order_doc)
    order_doc["_id"] = res.inserted_id
    await db.users.update_one({"_id": current["_id"]}, {"$inc": {"total_orders": 1}})
    await _add_notification(str(current["_id"]), "Pembayaran berhasil",
                            f"Pesanan {code} di {resto.get('name','')} diterima.", str(res.inserted_id))
    return _make_public_order(order_doc)


@api_router.get("/orders")
async def list_orders(current: dict = Depends(get_current_user)):
    docs = await db.orders.find({"user_id": str(current["_id"])}).sort("created_at", -1).to_list(200)
    out = []
    for d in docs:
        d = await _persist_status(d)
        out.append(_make_public_order(d))
    return out


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    doc = await db.orders.find_one({"_id": ObjectId(order_id), "user_id": str(current["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    doc = await _persist_status(doc)
    return _make_public_order(doc)


@api_router.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    doc = await db.orders.find_one({"_id": ObjectId(order_id), "user_id": str(current["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if doc.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Pesanan ini tidak dapat dibatalkan")
    elapsed = (_now() - _parse_dt(doc.get("created_at"))).total_seconds()
    if elapsed > CANCEL_WINDOW_SECONDS:
        raise HTTPException(status_code=400, detail="Batas waktu pembatalan sudah lewat")
    await db.orders.update_one({"_id": doc["_id"]}, {"$set": {"status": "cancelled"}})
    await db.users.update_one({"_id": current["_id"]}, {"$inc": {"total_orders": -1}})
    doc["status"] = "cancelled"
    await _add_notification(str(current["_id"]), *STATUS_NOTIF["cancelled"], str(doc["_id"]))
    return _make_public_order(doc)


@api_router.post("/orders/{order_id}/complete")
async def complete_order(order_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(order_id):
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    doc = await db.orders.find_one({"_id": ObjectId(order_id), "user_id": str(current["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    doc = await _persist_status(doc)
    if doc.get("status") != "ready":
        raise HTTPException(status_code=400, detail="Pesanan belum siap untuk diselesaikan")
    await db.orders.update_one({"_id": doc["_id"]}, {"$set": {"status": "completed"}})
    doc["status"] = "completed"
    await _add_notification(str(current["_id"]), *STATUS_NOTIF["completed"], str(doc["_id"]))
    return _make_public_order(doc)


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------
class CreateReviewIn(BaseModel):
    order_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = ""


@api_router.post("/reviews")
async def create_review(body: CreateReviewIn, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(body.order_id):
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    order = await db.orders.find_one({"_id": ObjectId(body.order_id), "user_id": str(current["_id"])})
    if not order:
        raise HTTPException(status_code=404, detail="Pesanan tidak ditemukan")
    if order.get("status") != "completed":
        raise HTTPException(status_code=400, detail="Hanya pesanan selesai yang bisa diulas")
    if order.get("reviewed"):
        raise HTTPException(status_code=409, detail="Pesanan ini sudah diulas")

    rid = order.get("restaurant_id")
    review_doc = {
        "user_id": str(current["_id"]),
        "user_name": current.get("name", "Pengguna"),
        "user_avatar": current.get("avatar_url", ""),
        "restaurant_id": rid,
        "order_id": body.order_id,
        "rating": body.rating,
        "comment": (body.comment or "").strip()[:500],
        "created_at": _now().isoformat(),
    }
    await db.reviews.insert_one(review_doc)
    await db.orders.update_one({"_id": order["_id"]}, {"$set": {"reviewed": True}})

    # Blend into restaurant aggregate (treat existing rating/count as prior).
    if ObjectId.is_valid(rid):
        resto = await db.restaurants.find_one({"_id": ObjectId(rid)})
        if resto:
            old_rating = float(resto.get("rating", 0) or 0)
            old_count = int(resto.get("review_count", 0) or 0)
            new_count = old_count + 1
            new_rating = round((old_rating * old_count + body.rating) / new_count, 1)
            await db.restaurants.update_one(
                {"_id": ObjectId(rid)},
                {"$set": {"rating": new_rating, "review_count": new_count}},
            )
    return {"ok": True}


@api_router.get("/restaurants/{restaurant_id}/reviews")
async def list_reviews(restaurant_id: str):
    docs = await db.reviews.find({"restaurant_id": restaurant_id}).sort("created_at", -1).to_list(200)
    out = []
    for d in docs:
        out.append({
            "id": str(d["_id"]),
            "userName": d.get("user_name", "Pengguna"),
            "userAvatar": d.get("user_avatar", ""),
            "rating": d.get("rating", 5),
            "comment": d.get("comment", ""),
            "createdAt": int(_parse_dt(d.get("created_at")).timestamp() * 1000),
        })
    return out


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
@api_router.get("/notifications")
async def list_notifications(current: dict = Depends(get_current_user)):
    docs = await db.notifications.find({"user_id": str(current["_id"])}).sort("created_at", -1).to_list(100)
    return [{
        "id": str(d["_id"]),
        "title": d.get("title", ""),
        "body": d.get("body", ""),
        "orderId": d.get("order_id", ""),
        "type": d.get("type", "order"),
        "read": bool(d.get("read", False)),
        "createdAt": int(_parse_dt(d.get("created_at")).timestamp() * 1000),
    } for d in docs]


@api_router.get("/notifications/unread-count")
async def unread_count(current: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents({"user_id": str(current["_id"]), "read": False})
    return {"count": count}


@api_router.post("/notifications/read-all")
async def read_all_notifications(current: dict = Depends(get_current_user)):
    await db.notifications.update_many({"user_id": str(current["_id"]), "read": False}, {"$set": {"read": True}})
    return {"ok": True}

# ===========================================================================
# SOCIAL: Feed & Reels (posts, likes, saves, comments, follows, reports)
# Additive food-first social layer. Reuses users/restaurants/menu_items and
# the existing notifications system. Nothing above this line is modified.
# ===========================================================================
import re as _re

POST_TYPES = {"photo", "carousel", "video", "reel"}
REPORT_TARGETS = {"post", "comment", "user"}
REPORT_REASONS = {"spam", "inappropriate", "harassment", "misleading", "copyright", "other"}
HASHTAG_RE = _re.compile(r"#(\w+)")
MENTION_RE = _re.compile(r"@(\w+)")


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[dict]:
    if not credentials or credentials.scheme.lower() != "bearer":
        return None
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id or not ObjectId.is_valid(user_id):
            return None
    except jwt.PyJWTError:
        return None
    return await db.users.find_one({"_id": ObjectId(user_id)})


class MediaIn(BaseModel):
    type: str = "image"           # "image" | "video"
    url: str
    poster: str = ""


class CreatePostIn(BaseModel):
    type: str
    media: List[MediaIn] = Field(min_length=1, max_length=10)
    caption: str = ""
    restaurant_id: Optional[str] = None
    dish_id: Optional[str] = None
    location: str = ""


class CreateCommentIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    parent_id: Optional[str] = None


class ReportIn(BaseModel):
    target_type: str
    target_id: str
    reason: str
    note: str = ""


def _rel_time(dt: datetime) -> str:
    secs = (_now() - dt).total_seconds()
    if secs < 60:
        return "baru saja"
    mins = int(secs // 60)
    if mins < 60:
        return f"{mins}m"
    hrs = int(mins // 60)
    if hrs < 24:
        return f"{hrs}j"
    days = int(hrs // 24)
    if days < 7:
        return f"{days}h"
    weeks = int(days // 7)
    if weeks < 5:
        return f"{weeks}mg"
    return dt.strftime("%d %b")


async def _viewer_post_state(post_ids: List[str], viewer_id: Optional[str]) -> dict:
    if not viewer_id or not post_ids:
        return {}
    liked = {d["post_id"] for d in await db.post_likes.find(
        {"user_id": viewer_id, "post_id": {"$in": post_ids}}).to_list(1000)}
    saved = {d["post_id"] for d in await db.post_saves.find(
        {"user_id": viewer_id, "post_id": {"$in": post_ids}}).to_list(1000)}
    return {"liked": liked, "saved": saved}


async def _viewer_following(author_ids: List[str], viewer_id: Optional[str]) -> set:
    if not viewer_id or not author_ids:
        return set()
    rows = await db.follows.find(
        {"follower_id": viewer_id, "following_id": {"$in": author_ids}}).to_list(1000)
    return {r["following_id"] for r in rows}


def _make_public_post(doc: dict, liked: bool, saved: bool, following: bool) -> dict:
    created = _parse_dt(doc.get("created_at"))
    return {
        "id": str(doc["_id"]),
        "type": doc.get("type", "photo"),
        "isReel": bool(doc.get("is_reel", False)),
        "author": {
            "id": str(doc.get("user_id", "")),
            "name": doc.get("author_name", ""),
            "username": doc.get("author_username", ""),
            "avatar": doc.get("author_avatar", ""),
            "verified": bool(doc.get("author_verified", False)),
            "following": following,
        },
        "media": doc.get("media", []),
        "caption": doc.get("caption", ""),
        "hashtags": doc.get("hashtags", []),
        "mentions": doc.get("mentions", []),
        "restaurantId": doc.get("restaurant_id"),
        "restaurantName": doc.get("restaurant_name"),
        "dishId": doc.get("dish_id"),
        "dishName": doc.get("dish_name"),
        "location": doc.get("location", ""),
        "likeCount": int(doc.get("like_count", 0)),
        "commentCount": int(doc.get("comment_count", 0)),
        "saveCount": int(doc.get("save_count", 0)),
        "viewCount": int(doc.get("view_count", 0)),
        "liked": liked,
        "saved": saved,
        "createdAt": int(created.timestamp() * 1000),
        "timeAgo": _rel_time(created),
    }


async def _serialize_posts(docs: List[dict], viewer_id: Optional[str]) -> List[dict]:
    ids = [str(d["_id"]) for d in docs]
    author_ids = list({str(d.get("user_id", "")) for d in docs})
    state = await _viewer_post_state(ids, viewer_id)
    liked_set = state.get("liked", set())
    saved_set = state.get("saved", set())
    following_set = await _viewer_following(author_ids, viewer_id)
    out = []
    for d in docs:
        pid = str(d["_id"])
        is_self = viewer_id and str(d.get("user_id", "")) == viewer_id
        out.append(_make_public_post(
            d, pid in liked_set, pid in saved_set,
            (str(d.get("user_id", "")) in following_set) and not is_self,
        ))
    return out


# ---------------------------------------------------------------------------
# Feed / Reels
# ---------------------------------------------------------------------------
@api_router.get("/feed")
async def get_feed(
    scope: str = "foryou",
    reels_only: bool = False,
    cursor: Optional[str] = None,
    limit: int = 8,
    viewer: Optional[dict] = Depends(get_optional_user),
):
    limit = max(1, min(limit, 20))
    query: dict = {}
    if reels_only:
        query["is_reel"] = True
    if scope == "following":
        if not viewer:
            raise HTTPException(status_code=401, detail="Masuk untuk melihat feed Following")
        vid = str(viewer["_id"])
        follows = await db.follows.find({"follower_id": vid}).to_list(2000)
        ids = [f["following_id"] for f in follows] + [vid]
        query["user_id"] = {"$in": ids}
    if cursor:
        query["created_at"] = {"$lt": cursor}
    docs = await db.posts.find(query).sort("created_at", -1).to_list(limit + 1)
    has_more = len(docs) > limit
    docs = docs[:limit]
    viewer_id = str(viewer["_id"]) if viewer else None
    items = await _serialize_posts(docs, viewer_id)
    next_cursor = docs[-1].get("created_at") if (has_more and docs) else None
    return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}


@api_router.get("/posts/{post_id}")
async def get_post(post_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    await db.posts.update_one({"_id": doc["_id"]}, {"$inc": {"view_count": 1}})
    viewer_id = str(viewer["_id"]) if viewer else None
    out = await _serialize_posts([doc], viewer_id)
    return out[0]


@api_router.post("/posts")
async def create_post(body: CreatePostIn, current: dict = Depends(get_current_user)):
    if body.type not in POST_TYPES:
        raise HTTPException(status_code=400, detail="Tipe konten tidak valid")
    for m in body.media:
        if m.type not in ("image", "video") or not m.url.strip():
            raise HTTPException(status_code=400, detail="Media tidak valid")
    is_reel = body.type == "reel"
    if is_reel and body.media[0].type != "video":
        raise HTTPException(status_code=400, detail="Reel harus berupa video")

    restaurant_name = None
    if body.restaurant_id:
        if not ObjectId.is_valid(body.restaurant_id):
            raise HTTPException(status_code=400, detail="Restoran tidak valid")
        resto = await db.restaurants.find_one({"_id": ObjectId(body.restaurant_id)})
        if not resto:
            raise HTTPException(status_code=400, detail="Restoran tidak ditemukan")
        restaurant_name = resto.get("name")

    dish_name = None
    if body.dish_id:
        if not ObjectId.is_valid(body.dish_id):
            raise HTTPException(status_code=400, detail="Menu tidak valid")
        dish = await db.menu_items.find_one({"_id": ObjectId(body.dish_id)})
        if not dish:
            raise HTTPException(status_code=400, detail="Menu tidak ditemukan")
        dish_name = dish.get("name")

    caption = body.caption.strip()[:2000]
    hashtags = list(dict.fromkeys(t.lower() for t in HASHTAG_RE.findall(caption)))
    mentions = list(dict.fromkeys(m.lower() for m in MENTION_RE.findall(caption)))
    now = _now()
    doc = {
        "user_id": str(current["_id"]),
        "author_name": current.get("name", ""),
        "author_username": current.get("username", ""),
        "author_avatar": current.get("avatar_url", ""),
        "author_verified": bool(current.get("verified", False)),
        "type": body.type,
        "is_reel": is_reel,
        "media": [m.model_dump() for m in body.media],
        "caption": caption,
        "hashtags": hashtags,
        "mentions": mentions,
        "restaurant_id": body.restaurant_id,
        "restaurant_name": restaurant_name,
        "dish_id": body.dish_id,
        "dish_name": dish_name,
        "location": body.location.strip()[:120],
        "like_count": 0,
        "comment_count": 0,
        "save_count": 0,
        "view_count": 0,
        "created_at": now.isoformat(),
    }
    res = await db.posts.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = await _serialize_posts([doc], str(current["_id"]))
    return out[0]


@api_router.delete("/posts/{post_id}")
async def delete_post(post_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    if str(doc.get("user_id")) != str(current["_id"]):
        raise HTTPException(status_code=403, detail="Kamu tidak bisa menghapus konten ini")
    await db.posts.delete_one({"_id": doc["_id"]})
    await db.post_likes.delete_many({"post_id": post_id})
    await db.post_saves.delete_many({"post_id": post_id})
    await db.comments.delete_many({"post_id": post_id})
    return {"ok": True}


@api_router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    uid = str(current["_id"])
    existing = await db.post_likes.find_one({"post_id": post_id, "user_id": uid})
    if existing:
        await db.post_likes.delete_one({"_id": existing["_id"]})
        await db.posts.update_one({"_id": doc["_id"]}, {"$inc": {"like_count": -1}})
        new_count = max(0, int(doc.get("like_count", 0)) - 1)
        return {"liked": False, "likeCount": new_count}
    await db.post_likes.insert_one({"post_id": post_id, "user_id": uid, "created_at": _now().isoformat()})
    await db.posts.update_one({"_id": doc["_id"]}, {"$inc": {"like_count": 1}})
    if str(doc.get("user_id")) != uid:
        await _add_notification(str(doc["user_id"]), "Suka baru",
                                f"{current.get('name','Seseorang')} menyukai kontenmu.",
                                ntype="like")
    return {"liked": True, "likeCount": int(doc.get("like_count", 0)) + 1}


@api_router.post("/posts/{post_id}/save")
async def toggle_save(post_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    doc = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    uid = str(current["_id"])
    existing = await db.post_saves.find_one({"post_id": post_id, "user_id": uid})
    if existing:
        await db.post_saves.delete_one({"_id": existing["_id"]})
        await db.posts.update_one({"_id": doc["_id"]}, {"$inc": {"save_count": -1}})
        return {"saved": False, "saveCount": max(0, int(doc.get("save_count", 0)) - 1)}
    await db.post_saves.insert_one({"post_id": post_id, "user_id": uid, "created_at": _now().isoformat()})
    await db.posts.update_one({"_id": doc["_id"]}, {"$inc": {"save_count": 1}})
    return {"saved": True, "saveCount": int(doc.get("save_count", 0)) + 1}


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------
def _make_public_comment(doc: dict, liked: bool, is_owner: bool) -> dict:
    created = _parse_dt(doc.get("created_at"))
    return {
        "id": str(doc["_id"]),
        "postId": doc.get("post_id", ""),
        "parentId": doc.get("parent_id"),
        "userId": str(doc.get("user_id", "")),
        "userName": doc.get("user_name", ""),
        "userAvatar": doc.get("user_avatar", ""),
        "text": doc.get("text", ""),
        "likeCount": int(doc.get("like_count", 0)),
        "replyCount": int(doc.get("reply_count", 0)),
        "liked": liked,
        "isOwner": is_owner,
        "createdAt": int(created.timestamp() * 1000),
        "timeAgo": _rel_time(created),
    }


async def _serialize_comments(docs: List[dict], viewer_id: Optional[str]) -> List[dict]:
    ids = [str(d["_id"]) for d in docs]
    liked_set = set()
    if viewer_id and ids:
        rows = await db.comment_likes.find(
            {"user_id": viewer_id, "comment_id": {"$in": ids}}).to_list(1000)
        liked_set = {r["comment_id"] for r in rows}
    return [
        _make_public_comment(d, str(d["_id"]) in liked_set,
                             viewer_id is not None and str(d.get("user_id", "")) == viewer_id)
        for d in docs
    ]


@api_router.get("/posts/{post_id}/comments")
async def get_comments(
    post_id: str,
    parent_id: Optional[str] = None,
    cursor: Optional[str] = None,
    limit: int = 15,
    viewer: Optional[dict] = Depends(get_optional_user),
):
    limit = max(1, min(limit, 40))
    query: dict = {"post_id": post_id, "parent_id": parent_id}
    if cursor:
        query["created_at"] = {"$lt": cursor}
    # top-level newest-first; replies oldest-first reads better
    sort_dir = 1 if parent_id else -1
    docs = await db.comments.find(query).sort("created_at", sort_dir).to_list(limit + 1)
    has_more = len(docs) > limit
    docs = docs[:limit]
    viewer_id = str(viewer["_id"]) if viewer else None
    items = await _serialize_comments(docs, viewer_id)
    next_cursor = docs[-1].get("created_at") if (has_more and docs) else None
    return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}


@api_router.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, body: CreateCommentIn, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(post_id):
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    post = await db.posts.find_one({"_id": ObjectId(post_id)})
    if not post:
        raise HTTPException(status_code=404, detail="Konten tidak ditemukan")
    parent = None
    if body.parent_id:
        if not ObjectId.is_valid(body.parent_id):
            raise HTTPException(status_code=400, detail="Komentar tidak valid")
        parent = await db.comments.find_one({"_id": ObjectId(body.parent_id), "post_id": post_id})
        if not parent:
            raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    now = _now()
    doc = {
        "post_id": post_id,
        "parent_id": body.parent_id,
        "user_id": str(current["_id"]),
        "user_name": current.get("name", ""),
        "user_avatar": current.get("avatar_url", ""),
        "text": body.text.strip()[:500],
        "like_count": 0,
        "reply_count": 0,
        "created_at": now.isoformat(),
    }
    res = await db.comments.insert_one(doc)
    doc["_id"] = res.inserted_id
    await db.posts.update_one({"_id": post["_id"]}, {"$inc": {"comment_count": 1}})
    if parent:
        await db.comments.update_one({"_id": parent["_id"]}, {"$inc": {"reply_count": 1}})
        if str(parent.get("user_id")) != str(current["_id"]):
            await _add_notification(str(parent["user_id"]), "Balasan baru",
                                    f"{current.get('name','Seseorang')} membalas komentarmu.", ntype="comment")
    elif str(post.get("user_id")) != str(current["_id"]):
        await _add_notification(str(post["user_id"]), "Komentar baru",
                                f"{current.get('name','Seseorang')} mengomentari kontenmu.", ntype="comment")
    out = await _serialize_comments([doc], str(current["_id"]))
    return out[0]


@api_router.post("/comments/{comment_id}/like")
async def toggle_comment_like(comment_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(comment_id):
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    doc = await db.comments.find_one({"_id": ObjectId(comment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    uid = str(current["_id"])
    existing = await db.comment_likes.find_one({"comment_id": comment_id, "user_id": uid})
    if existing:
        await db.comment_likes.delete_one({"_id": existing["_id"]})
        await db.comments.update_one({"_id": doc["_id"]}, {"$inc": {"like_count": -1}})
        return {"liked": False, "likeCount": max(0, int(doc.get("like_count", 0)) - 1)}
    await db.comment_likes.insert_one({"comment_id": comment_id, "user_id": uid})
    await db.comments.update_one({"_id": doc["_id"]}, {"$inc": {"like_count": 1}})
    return {"liked": True, "likeCount": int(doc.get("like_count", 0)) + 1}


@api_router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(comment_id):
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    doc = await db.comments.find_one({"_id": ObjectId(comment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Komentar tidak ditemukan")
    if str(doc.get("user_id")) != str(current["_id"]):
        raise HTTPException(status_code=403, detail="Kamu tidak bisa menghapus komentar ini")
    reply_ids = [str(r["_id"]) for r in await db.comments.find({"parent_id": comment_id}).to_list(1000)]
    removed = 1 + len(reply_ids)
    await db.comments.delete_many({"$or": [{"_id": doc["_id"]}, {"parent_id": comment_id}]})
    if doc.get("parent_id") and ObjectId.is_valid(doc["parent_id"]):
        await db.comments.update_one({"_id": ObjectId(doc["parent_id"])}, {"$inc": {"reply_count": -1}})
    await db.posts.update_one({"_id": ObjectId(doc["post_id"])}, {"$inc": {"comment_count": -removed}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Follows & social profile
# ---------------------------------------------------------------------------
@api_router.post("/users/{user_id}/follow")
async def toggle_follow(user_id: str, current: dict = Depends(get_current_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    if user_id == str(current["_id"]):
        raise HTTPException(status_code=400, detail="Tidak bisa mengikuti diri sendiri")
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    vid = str(current["_id"])
    existing = await db.follows.find_one({"follower_id": vid, "following_id": user_id})
    if existing:
        await db.follows.delete_one({"_id": existing["_id"]})
        following = False
    else:
        await db.follows.insert_one({"follower_id": vid, "following_id": user_id, "created_at": _now().isoformat()})
        following = True
        await _add_notification(user_id, "Pengikut baru",
                                f"{current.get('name','Seseorang')} mulai mengikutimu.", ntype="follow")
    follower_count = await db.follows.count_documents({"following_id": user_id})
    return {"following": following, "followerCount": follower_count}


async def _social_profile(user_doc: dict, viewer_id: Optional[str]) -> dict:
    uid = str(user_doc["_id"])
    posts = await db.posts.count_documents({"user_id": uid})
    followers = await db.follows.count_documents({"following_id": uid})
    following = await db.follows.count_documents({"follower_id": uid})
    is_following = False
    if viewer_id and viewer_id != uid:
        is_following = bool(await db.follows.find_one({"follower_id": viewer_id, "following_id": uid}))
    return {
        "id": uid,
        "name": user_doc.get("name", ""),
        "username": user_doc.get("username", ""),
        "avatar": user_doc.get("avatar_url", ""),
        "bio": user_doc.get("bio", ""),
        "verified": bool(user_doc.get("verified", False)),
        "postCount": posts,
        "followerCount": followers,
        "followingCount": following,
        "isFollowing": is_following,
        "isSelf": viewer_id == uid,
    }


@api_router.get("/users/{user_id}")
async def get_social_profile(user_id: str, viewer: Optional[dict] = Depends(get_optional_user)):
    if not ObjectId.is_valid(user_id):
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    return await _social_profile(doc, str(viewer["_id"]) if viewer else None)


@api_router.get("/users/{user_id}/posts")
async def get_user_posts(user_id: str, reels_only: bool = False,
                         viewer: Optional[dict] = Depends(get_optional_user)):
    query: dict = {"user_id": user_id}
    if reels_only:
        query["is_reel"] = True
    docs = await db.posts.find(query).sort("created_at", -1).to_list(200)
    return await _serialize_posts(docs, str(viewer["_id"]) if viewer else None)


@api_router.get("/me/saved")
async def get_saved_posts(current: dict = Depends(get_current_user)):
    saves = await db.post_saves.find({"user_id": str(current["_id"])}).sort("created_at", -1).to_list(500)
    ids = [ObjectId(s["post_id"]) for s in saves if ObjectId.is_valid(s["post_id"])]
    if not ids:
        return []
    docs = await db.posts.find({"_id": {"$in": ids}}).to_list(500)
    order = {str(s["post_id"]): i for i, s in enumerate(saves)}
    docs.sort(key=lambda d: order.get(str(d["_id"]), 999))
    return await _serialize_posts(docs, str(current["_id"]))


# ---------------------------------------------------------------------------
# Social search & reports
# ---------------------------------------------------------------------------
@api_router.get("/social/search")
async def social_search(q: str, viewer: Optional[dict] = Depends(get_optional_user)):
    term = (q or "").strip()
    if not term:
        return {"users": [], "posts": [], "restaurants": [], "hashtags": []}
    rx = {"$regex": _re.escape(term.lstrip("#@")), "$options": "i"}
    users = await db.users.find({"$or": [{"name": rx}, {"username": rx}]}).to_list(15)
    user_out = [{
        "id": str(u["_id"]), "name": u.get("name", ""), "username": u.get("username", ""),
        "avatar": u.get("avatar_url", ""), "verified": bool(u.get("verified", False)),
    } for u in users]
    restos = await db.restaurants.find({"$or": [{"name": rx}, {"cuisine": rx}]}).to_list(15)
    resto_out = [{"id": str(r["_id"]), "name": r.get("name", ""), "cuisine": r.get("cuisine", ""),
                  "image": r.get("avatar_image", "")} for r in restos]
    tag = term.lstrip("#").lower()
    post_docs = await db.posts.find(
        {"$or": [{"caption": rx}, {"hashtags": tag}]}).sort("created_at", -1).to_list(20)
    posts = await _serialize_posts(post_docs, str(viewer["_id"]) if viewer else None)
    hashtags: dict = {}
    for p in post_docs:
        for h in p.get("hashtags", []):
            if tag in h:
                hashtags[h] = hashtags.get(h, 0) + 1
    hashtag_out = [{"tag": k, "count": v} for k, v in
                   sorted(hashtags.items(), key=lambda x: -x[1])[:10]]
    return {"users": user_out, "posts": posts, "restaurants": resto_out, "hashtags": hashtag_out}


@api_router.post("/reports")
async def create_report(body: ReportIn, current: dict = Depends(get_current_user)):
    if body.target_type not in REPORT_TARGETS:
        raise HTTPException(status_code=400, detail="Jenis laporan tidak valid")
    if body.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Alasan laporan tidak valid")
    await db.reports.insert_one({
        "reporter_id": str(current["_id"]),
        "target_type": body.target_type,
        "target_id": body.target_id,
        "reason": body.reason,
        "note": (body.note or "").strip()[:500],
        "status": "open",
        "created_at": _now().isoformat(),
    })
    return {"ok": True}


# ---------------------------------------------------------------------------
# Social seed (dev data) — idempotent, only when posts collection is empty
# ---------------------------------------------------------------------------
SOCIAL_VIDEOS = [
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
]


async def seed_social():
    if await db.posts.count_documents({}) > 0:
        return
    logger.info("Seeding Eatly social data (dev)...")

    creators = [
        {"email": "sari@eatly.com", "name": "Sari Wibowo", "username": "sarieats",
         "avatar_url": "https://i.pravatar.cc/300?img=45", "verified": True,
         "bio": "Food explorer Jakarta 🍜 | Kolektor tempat makan enak"},
        {"email": "budi@eatly.com", "name": "Budi Hartono", "username": "bhfoodie",
         "avatar_url": "https://i.pravatar.cc/300?img=12", "verified": False,
         "bio": "Suka kulineran & kopi ☕"},
        {"email": "maya@eatly.com", "name": "Maya Anggraini", "username": "mayaeats",
         "avatar_url": "https://i.pravatar.cc/300?img=32", "verified": True,
         "bio": "Dessert hunter 🍰 | Review jujur"},
        {"email": "chef.rendra@eatly.com", "name": "Chef Rendra", "username": "chefrendra",
         "avatar_url": "https://i.pravatar.cc/300?img=68", "verified": True,
         "bio": "Chef & pemilik dapur. Behind the scenes tiap hari."},
    ]
    cid: dict = {}
    for c in creators:
        existing = await db.users.find_one({"email": c["email"]})
        if existing:
            await db.users.update_one({"_id": existing["_id"]},
                                      {"$set": {"verified": c["verified"], "bio": c["bio"]}})
            cid[c["username"]] = str(existing["_id"])
            continue
        doc = {**c, "referral_code": c["username"].upper()[:6] + "2026",
               "total_orders": 0, "invited_friends": 0,
               "password_hash": hash_password("password123"),
               "created_at": _now().isoformat()}
        res = await db.users.insert_one(doc)
        cid[c["username"]] = str(res.inserted_id)

    restos = await db.restaurants.find().to_list(50)
    by_name = {r.get("name"): r for r in restos}

    async def menu_for(resto_id: str, name_hint: str = ""):
        items = await db.menu_items.find({"restaurant_id": resto_id}).to_list(50)
        if not items:
            return (None, None)
        for it in items:
            if name_hint.lower() in it.get("name", "").lower():
                return (str(it["_id"]), it.get("name"))
        return (str(items[0]["_id"]), items[0].get("name"))

    warung = by_name.get("Warung Sinar Bahagia")
    sushi = by_name.get("Sushi Tei Kemang")
    laksa = by_name.get("Kedai Laksa Betawi")
    kue = by_name.get("Toko Kue Nusantara")
    ayam = by_name.get("Ayam Bakar Taliwang")
    kopi = by_name.get("Kopi Senja")

    def rid(r):
        return str(r["_id"]) if r else None

    posts = []
    base = _now()

    async def mk(creator, ptype, media, caption, resto=None, dish_hint="", location="Jakarta Selatan",
                like=0, save=0, view=0, offset_min=0):
        dish_id, dish_name = (None, None)
        if resto and dish_hint:
            dish_id, dish_name = await menu_for(rid(resto), dish_hint)
        created = (base - timedelta(minutes=offset_min)).isoformat()
        hashtags = list(dict.fromkeys(t.lower() for t in HASHTAG_RE.findall(caption)))
        posts.append({
            "user_id": cid[creator],
            "author_name": next(c["name"] for c in creators if c["username"] == creator),
            "author_username": creator,
            "author_avatar": next(c["avatar_url"] for c in creators if c["username"] == creator),
            "author_verified": next(c["verified"] for c in creators if c["username"] == creator),
            "type": ptype,
            "is_reel": ptype == "reel",
            "media": media,
            "caption": caption,
            "hashtags": hashtags,
            "mentions": [],
            "restaurant_id": rid(resto),
            "restaurant_name": resto.get("name") if resto else None,
            "dish_id": dish_id,
            "dish_name": dish_name,
            "location": location,
            "like_count": like, "comment_count": 0, "save_count": save, "view_count": view,
            "created_at": created,
        })

    await mk("sarieats", "photo",
             [{"type": "image", "url": IMG["rendang"], "poster": ""}],
             "Rendang paling empuk di Kemang, bumbunya nampol banget 🔥 #rendang #kulinerjakarta #eatly",
             warung, "Rendang", like=248, save=52, view=1200, offset_min=12)
    await mk("chefrendra", "reel",
             [{"type": "video", "url": SOCIAL_VIDEOS[0], "poster": IMG["nasi_goreng"]}],
             "POV: nasi goreng spesial lagi diracik di wajan panas 🍳 #nasigoreng #streetfood #eatly",
             warung, "Nasi Goreng", like=1820, save=340, view=24500, offset_min=30)
    await mk("mayaeats", "carousel",
             [{"type": "image", "url": IMG["cake"], "poster": ""},
              {"type": "image", "url": IMG["cendol"], "poster": ""},
              {"type": "image", "url": IMG["coffee"], "poster": ""}],
             "Dessert tour di Toko Kue Nusantara! Swipe buat lihat semua 🍰 #dessert #manis #eatly",
             kue, "Klappertaart", like=412, save=88, view=3100, offset_min=55)
    await mk("bhfoodie", "photo",
             [{"type": "image", "url": IMG["sushi"], "poster": ""}],
             "Salmon sashimi-nya fresh banget, wajib cobain kalau ke sini 🍣 #sushi #japanesefood #eatly",
             sushi, "Salmon", like=530, save=120, view=4200, offset_min=90)
    await mk("sarieats", "reel",
             [{"type": "video", "url": SOCIAL_VIDEOS[1], "poster": IMG["laksa"]}],
             "Laksa Betawi legendaris, kuah santannya juara! Worth it? Definitely 🍜 #laksa #betawi #eatly",
             laksa, "Laksa", like=2140, save=410, view=31200, offset_min=120)
    await mk("mayaeats", "photo",
             [{"type": "image", "url": IMG["ayam"], "poster": ""}],
             "Ayam bakar Taliwang sambalnya pedas nampol 🌶️ cocok buat pecinta pedas #ayambakar #pedas #eatly",
             ayam, "Ayam Bakar", like=298, save=61, view=2400, offset_min=180)
    await mk("bhfoodie", "reel",
             [{"type": "video", "url": SOCIAL_VIDEOS[2], "poster": IMG["coffee"]}],
             "Kopi susu gula aren favorit sore-sore di Kopi Senja ☕ #kopi #coffee #eatly",
             kopi, "Kopi Susu", like=980, save=210, view=15400, offset_min=240)
    await mk("chefrendra", "carousel",
             [{"type": "image", "url": IMG["interior"], "poster": ""},
              {"type": "image", "url": IMG["sate"], "poster": ""},
              {"type": "image", "url": IMG["gado"], "poster": ""}],
             "Behind the scenes dapur kami hari ini 👨‍🍳 dari interior sampai plating #bts #dapur #eatly",
             warung, "Sate", like=356, save=74, view=2800, offset_min=320)

    res = await db.posts.insert_many(posts)
    ids = res.inserted_ids

    # A few real follow relationships between seed creators (dev data).
    seed_follows = [
        ("bhfoodie", "sarieats"), ("mayaeats", "sarieats"), ("bhfoodie", "chefrendra"),
        ("sarieats", "chefrendra"), ("mayaeats", "chefrendra"), ("sarieats", "mayaeats"),
    ]
    for follower, following in seed_follows:
        await db.follows.insert_one({"follower_id": cid[follower], "following_id": cid[following],
                                     "created_at": _now().isoformat()})

    # A couple of real seed comments so the UI isn't empty.
    if ids:
        top = await db.posts.find_one({"_id": ids[0]})
        c1 = {"post_id": str(ids[0]), "parent_id": None, "user_id": cid["bhfoodie"],
              "user_name": "Budi Hartono", "user_avatar": creators[1]["avatar_url"],
              "text": "Ini sih favorit aku juga! 🔥", "like_count": 12, "reply_count": 1,
              "created_at": (base - timedelta(minutes=8)).isoformat()}
        r1 = await db.comments.insert_one(c1)
        await db.comments.insert_one({"post_id": str(ids[0]), "parent_id": str(r1.inserted_id),
              "user_id": cid["sarieats"], "user_name": "Sari Wibowo",
              "user_avatar": creators[0]["avatar_url"], "text": "Setuju banget, coba yang extra pedas 🌶️",
              "like_count": 3, "reply_count": 0, "created_at": (base - timedelta(minutes=5)).isoformat()})
        await db.comments.insert_one({"post_id": str(ids[0]), "parent_id": None, "user_id": cid["mayaeats"],
              "user_name": "Maya Anggraini", "user_avatar": creators[2]["avatar_url"],
              "text": "Kepengen ke sini weekend ini 😍", "like_count": 5, "reply_count": 0,
              "created_at": (base - timedelta(minutes=3)).isoformat()})
        await db.posts.update_one({"_id": ids[0]}, {"$set": {"comment_count": 3}})
    logger.info("Social seed complete.")




app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    # Bearer-token auth (Authorization header), no cookies — credentials are not
    # needed. allow_credentials=True combined with a "*" origin is rejected by
    # browsers (preflight passes but the real request is blocked), which surfaced
    # as a bare "failed to fetch" on login/register. Keeping credentials False
    # makes the "*" origin valid for every client.
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
IMG = {
    "interior": "https://images.unsplash.com/photo-1613274554329-70f997f5789f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200",
    "nasi_goreng": "https://images.unsplash.com/photo-1647093953000-9065ed6f85ef?crop=entropy&cs=srgb&fm=jpg&q=85&w=1000",
    "sate": "https://images.pexels.com/photos/37076559/pexels-photo-37076559.jpeg?auto=compress&cs=tinysrgb&w=1000",
    "rendang": "https://images.unsplash.com/photo-1606491956689-2ea866880c84?auto=format&fit=crop&w=1000&q=80",
    "sushi": "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?auto=format&fit=crop&w=1000&q=80",
    "laksa": "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1000&q=80",
    "cendol": "https://images.unsplash.com/photo-1541696490-8744a5dc0228?auto=format&fit=crop&w=1000&q=80",
    "coffee": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1000&q=80",
    "cake": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1000&q=80",
    "ayam": "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=1000&q=80",
    "gado": "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=1000&q=80",
    "esteh": "https://images.unsplash.com/photo-1499638673689-79a0b5115d87?auto=format&fit=crop&w=1000&q=80",
    "resto2": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80",
    "resto3": "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=1200&q=80",
    "resto4": "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=1200&q=80",
    "resto5": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80",
    "resto6": "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1200&q=80",
}


def _spice_group():
    return {
        "name": "Level Pedas",
        "type": "single",
        "required": True,
        "choices": [
            {"name": "Tidak Pedas", "price_delta": 0},
            {"name": "Sedang", "price_delta": 0},
            {"name": "Pedas", "price_delta": 0},
            {"name": "Extra Pedas", "price_delta": 3000},
        ],
    }


def _nasi_group():
    return {
        "name": "Pilihan Nasi",
        "type": "single",
        "required": True,
        "choices": [
            {"name": "Nasi Putih", "price_delta": 0},
            {"name": "Nasi terpisah", "price_delta": 0},
            {"name": "Tanpa Nasi", "price_delta": -5000},
        ],
    }


def _addon_group():
    return {
        "name": "Tambahan",
        "type": "multi",
        "required": False,
        "choices": [
            {"name": "Telur Balado", "price_delta": 8000},
            {"name": "Kerupuk", "price_delta": 5000},
            {"name": "Sambal Ijo", "price_delta": 3000},
        ],
    }


async def seed_data():
    if await db.restaurants.count_documents({}) > 0:
        return
    logger.info("Seeding Eatly data...")

    restaurants = [
        {
            "name": "Warung Sinar Bahagia", "cuisine": "Masakan Nusantara", "price_level": "Rp Rp",
            "halal": True, "rating": 4.8, "review_count": 1284, "status": "buka", "availability": "available",
            "description": "Rumah masakan nusantara sejak 1998. Bumbu diracik segar setiap pagi dari pasar tradisional Kemang.",
            "tags": ["Halal Bersertifikat", "Ramah Keluarga", "Punya Terrace"],
            "hero_image": IMG["interior"], "avatar_image": IMG["rendang"],
            "estimate_min": 10, "estimate_max": 15, "distance_km": 1.2, "capacity_tables": 24,
            "community_rating": 4.8, "community_pick": True,
        },
        {
            "name": "Kedai Laksa Betawi", "cuisine": "Masakan Betawi", "price_level": "Rp Rp",
            "halal": True, "rating": 4.9, "review_count": 876, "status": "buka", "availability": "limited",
            "description": "Laksa Betawi legendaris dengan kuah santan gurih dan rempah pilihan.",
            "tags": ["Halal", "Legendaris", "Cocok Rame-rame"],
            "hero_image": IMG["resto2"], "avatar_image": IMG["laksa"],
            "estimate_min": 6, "estimate_max": 10, "distance_km": 2.8, "capacity_tables": 16,
            "community_rating": 4.9, "community_pick": True,
        },
        {
            "name": "Toko Kue Nusantara", "cuisine": "Pencuci Mulut", "price_level": "Rp",
            "halal": True, "rating": 4.7, "review_count": 421, "status": "buka", "availability": "available",
            "description": "Aneka kue tradisional dan pencuci mulut khas Nusantara yang manis dan legit.",
            "tags": ["Manis", "Take Away", "Ramah Anak"],
            "hero_image": IMG["resto3"], "avatar_image": IMG["cake"],
            "estimate_min": 3, "estimate_max": 5, "distance_km": 1.1, "capacity_tables": 12,
            "community_rating": 4.7, "community_pick": True,
        },
        {
            "name": "Sushi Tei Kemang", "cuisine": "Masakan Jepang", "price_level": "Rp Rp Rp",
            "halal": False, "rating": 4.6, "review_count": 980, "status": "buka", "availability": "available",
            "description": "Sushi dan sashimi segar setiap hari, dengan chef berpengalaman langsung dari Jepang.",
            "tags": ["Fresh", "Fine Dining", "Reservasi"],
            "hero_image": IMG["resto4"], "avatar_image": IMG["sushi"],
            "estimate_min": 12, "estimate_max": 18, "distance_km": 3.4, "capacity_tables": 30,
            "community_rating": 4.6, "community_pick": False,
        },
        {
            "name": "Ayam Bakar Taliwang", "cuisine": "Masakan Lombok", "price_level": "Rp Rp",
            "halal": True, "rating": 4.5, "review_count": 640, "status": "buka", "availability": "limited",
            "description": "Ayam bakar Taliwang autentik dengan sambal khas Lombok yang pedas menggigit.",
            "tags": ["Halal", "Pedas", "Populer"],
            "hero_image": IMG["resto5"], "avatar_image": IMG["ayam"],
            "estimate_min": 15, "estimate_max": 20, "distance_km": 4.1, "capacity_tables": 18,
            "community_rating": 4.5, "community_pick": False,
        },
        {
            "name": "Kopi Senja", "cuisine": "Kafe", "price_level": "Rp Rp",
            "halal": True, "rating": 4.4, "review_count": 512, "status": "buka", "availability": "full",
            "description": "Kafe kopi specialty dengan suasana hangat, cocok untuk kerja dan nongkrong sore.",
            "tags": ["Kopi", "Wifi", "Cozy"],
            "hero_image": IMG["resto6"], "avatar_image": IMG["coffee"],
            "estimate_min": 8, "estimate_max": 12, "distance_km": 0.8, "capacity_tables": 20,
            "community_rating": 4.4, "community_pick": False,
        },
    ]

    inserted = {}
    for r in restaurants:
        r.setdefault("open_hours", "10.00 - 22.00 WIB")
        r.setdefault("address", "Jl. Kemang Raya No. 10, Jakarta Selatan")
        res = await db.restaurants.insert_one(r)
        inserted[r["name"]] = str(res.inserted_id)

    warung = inserted["Warung Sinar Bahagia"]
    laksa = inserted["Kedai Laksa Betawi"]
    kue = inserted["Toko Kue Nusantara"]
    sushi = inserted["Sushi Tei Kemang"]
    ayam = inserted["Ayam Bakar Taliwang"]
    kopi = inserted["Kopi Senja"]

    menu = [
        {"restaurant_id": warung, "name": "Rendang Sapi", "description": "Rendang khas Padang, empuk & kaya rempah.",
         "price": 68000, "image": IMG["rendang"], "category": "Paling Populer", "tags": ["Halal", "Populer"],
         "popular": True, "available": True, "options": [_spice_group(), _nasi_group(), _addon_group()]},
        {"restaurant_id": warung, "name": "Nasi Goreng Spesial", "description": "Nasi goreng dengan ayam, udang, & telur.",
         "price": 45000, "image": IMG["nasi_goreng"], "category": "Paling Populer", "tags": ["Populer"],
         "popular": True, "available": True, "options": [_spice_group(), _addon_group()]},
        {"restaurant_id": warung, "name": "Sate Ayam Madura", "description": "Sate ayam bumbu kacang khas Madura, 10 tusuk.",
         "price": 40000, "image": IMG["sate"], "category": "Makanan Utama", "tags": ["Halal"],
         "popular": False, "available": True, "options": [_nasi_group()]},
        {"restaurant_id": warung, "name": "Gado-Gado", "description": "Sayuran segar dengan siraman bumbu kacang.",
         "price": 35000, "image": IMG["gado"], "category": "Makanan Utama", "tags": ["Vegetarian"],
         "popular": False, "available": True, "options": []},
        {"restaurant_id": warung, "name": "Es Cendol", "description": "Cendol dengan santan dan gula merah asli.",
         "price": 18000, "image": IMG["cendol"], "category": "Minuman", "tags": [],
         "popular": False, "available": True, "options": []},
        {"restaurant_id": warung, "name": "Es Teh Manis", "description": "Teh manis dingin menyegarkan.",
         "price": 8000, "image": IMG["esteh"], "category": "Minuman", "tags": [],
         "popular": False, "available": False, "options": []},
        {"restaurant_id": laksa, "name": "Laksa Betawi Komplit", "description": "Kuah santan gurih dengan bihun, telur, dan perkedel.",
         "price": 42000, "image": IMG["laksa"], "category": "Paling Populer", "tags": ["Halal", "Populer"],
         "popular": True, "available": True, "options": [_spice_group()]},
        {"restaurant_id": laksa, "name": "Soto Betawi", "description": "Soto daging sapi dengan kuah susu yang creamy.",
         "price": 48000, "image": IMG["rendang"], "category": "Makanan Utama", "tags": ["Halal"],
         "popular": True, "available": True, "options": [_nasi_group()]},
        {"restaurant_id": laksa, "name": "Es Selendang Mayang", "description": "Minuman tradisional Betawi yang manis dan segar.",
         "price": 15000, "image": IMG["cendol"], "category": "Minuman", "tags": [],
         "popular": False, "available": True, "options": []},
        {"restaurant_id": kue, "name": "Klappertaart", "description": "Kue kelapa lembut khas Manado.",
         "price": 28000, "image": IMG["cake"], "category": "Paling Populer", "tags": ["Manis", "Populer"],
         "popular": True, "available": True, "options": []},
        {"restaurant_id": kue, "name": "Lapis Legit", "description": "Kue lapis legit klasik dengan rempah.",
         "price": 32000, "image": IMG["cake"], "category": "Makanan Utama", "tags": ["Manis"],
         "popular": False, "available": True, "options": []},
        {"restaurant_id": sushi, "name": "Salmon Sashimi", "description": "Irisan salmon segar premium, 5 pcs.",
         "price": 78000, "image": IMG["sushi"], "category": "Paling Populer", "tags": ["Fresh", "Populer"],
         "popular": True, "available": True, "options": []},
        {"restaurant_id": sushi, "name": "California Roll", "description": "Roll klasik dengan kepiting, alpukat, dan timun.",
         "price": 55000, "image": IMG["sushi"], "category": "Makanan Utama", "tags": [],
         "popular": True, "available": True, "options": []},
        {"restaurant_id": ayam, "name": "Ayam Bakar Taliwang", "description": "Ayam bakar dengan sambal khas Lombok.",
         "price": 52000, "image": IMG["ayam"], "category": "Paling Populer", "tags": ["Halal", "Pedas", "Populer"],
         "popular": True, "available": True, "options": [_spice_group(), _nasi_group()]},
        {"restaurant_id": ayam, "name": "Plecing Kangkung", "description": "Kangkung segar dengan sambal tomat pedas.",
         "price": 22000, "image": IMG["gado"], "category": "Makanan Utama", "tags": ["Pedas"],
         "popular": False, "available": True, "options": []},
        {"restaurant_id": kopi, "name": "Kopi Susu Senja", "description": "Signature es kopi susu dengan gula aren.",
         "price": 25000, "image": IMG["coffee"], "category": "Paling Populer", "tags": ["Populer"],
         "popular": True, "available": True, "options": []},
        {"restaurant_id": kopi, "name": "Croissant Butter", "description": "Croissant renyah dengan mentega premium.",
         "price": 28000, "image": IMG["cake"], "category": "Makanan Utama", "tags": [],
         "popular": False, "available": True, "options": []},
    ]
    await db.menu_items.insert_many(menu)

    reels = [
        {"restaurant_id": warung, "restaurant_name": "Warung Sinar Bahagia", "user_name": "Sari Wibowo",
         "user_handle": "@sarieats", "user_avatar": "https://i.pravatar.cc/150?img=45",
         "caption": "Rendang paling empuk di Kemang! \U0001F525", "thumb": IMG["rendang"], "duration": "0:45",
         "views": 12400, "rating": 5},
        {"restaurant_id": sushi, "restaurant_name": "Sushi Tei Kemang", "user_name": "Budi Hartono",
         "user_handle": "@bhfoodie", "user_avatar": "https://i.pravatar.cc/150?img=12",
         "caption": "Salmon-nya fresh, wajib dicoba!", "thumb": IMG["sushi"], "duration": "0:32",
         "views": 8700, "rating": 5},
        {"restaurant_id": laksa, "restaurant_name": "Kedai Laksa Betawi", "user_name": "Maya Anggraini",
         "user_handle": "@mayaeats", "user_avatar": "https://i.pravatar.cc/150?img=32",
         "caption": "Laksa Betawi legendaris, kuahnya juara!", "thumb": IMG["laksa"], "duration": "0:28",
         "views": 5300, "rating": 5},
    ]
    await db.reels.insert_many(reels)

    if not await db.users.find_one({"email": "andi@eatly.com"}):
        await db.users.insert_one({
            "email": "andi@eatly.com", "name": "Andi Prasetyo", "username": "andipras",
            "avatar_url": "https://i.pravatar.cc/300?img=13", "referral_code": "ANDI2026",
            "total_orders": 47, "invited_friends": 12,
            "password_hash": hash_password("password123"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    logger.info("Seed complete.")


async def _order_progression_loop():
    """Advance active orders on a timer so status updates + notifications
    happen even when the client isn't polling that specific order."""
    while True:
        try:
            await asyncio.sleep(5)
            docs = await db.orders.find({"status": {"$in": ["paid", "preparing"]}}).to_list(500)
            for d in docs:
                await _persist_status(d)
        except Exception as e:  # keep the loop alive
            logger.warning(f"progression loop error: {e}")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.orders.create_index("user_id")
    await db.notifications.create_index("user_id")
    await db.reviews.create_index("restaurant_id")
    await db.posts.create_index([("created_at", -1)])
    await db.posts.create_index("user_id")
    await db.posts.create_index("is_reel")
    await db.posts.create_index("hashtags")
    await db.post_likes.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.post_saves.create_index([("post_id", 1), ("user_id", 1)], unique=True)
    await db.comments.create_index([("post_id", 1), ("parent_id", 1), ("created_at", -1)])
    await db.comment_likes.create_index([("comment_id", 1), ("user_id", 1)], unique=True)
    await db.follows.create_index([("follower_id", 1), ("following_id", 1)], unique=True)
    await db.follows.create_index("following_id")
    await db.reports.create_index("status")
    await seed_data()
    await seed_social()
    asyncio.create_task(_order_progression_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
