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
    await seed_data()
    asyncio.create_task(_order_progression_loop())


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
