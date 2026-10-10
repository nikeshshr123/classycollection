import json
import os
import secrets
import sqlite3
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock, RLock
from time import time
from typing import Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator


DATA_PATH = Path(__file__).with_name("data.json")
DATABASE_PATH = Path(os.getenv("CLASSSY_DATABASE_PATH", str(Path(__file__).parents[2] / "classsy.sqlite3")))
ADMIN_USERNAME = os.getenv("CLASSSY_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("CLASSSY_ADMIN_PASSWORD", "classsy123")
ADMIN_SESSION_SECONDS = 12 * 60 * 60
CATEGORIES = {"Girls Clothes", "Jewellery", "Nails", "Makeup"}

store_lock = RLock()
session_lock = Lock()
admin_sessions: dict[str, float] = {}

app = FastAPI(title="Classsy Collection API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CLASSSY_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SiteSettings(BaseModel):
    brand: str = Field(min_length=2, max_length=80)
    tagline: str = Field(min_length=2, max_length=180)
    heroTitle: str = Field(min_length=2, max_length=80)
    heroSubtitle: str = Field(min_length=2, max_length=260)
    heroImage: str = Field(default="", max_length=8_000_000)
    announcement: str = Field(min_length=2, max_length=180)
    phone: str = Field(min_length=5, max_length=40)
    email: EmailStr
    address: str = Field(min_length=2, max_length=160)
    instagram: str = Field(min_length=2, max_length=80)
    whatsapp: str = Field(min_length=5, max_length=40)
    esewaQr: str = ""
    mobileBankingQr: str = ""
    todayOffer: str = ""
    groupSale: str = ""
    deliveryInfo: str = "Delivery timing and charges are confirmed before dispatch."
    returnPolicy: str = "Please message us before ordering to confirm sizing and exchange eligibility."


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    category: str
    price: int = Field(ge=1)
    style: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=2, max_length=320)
    image: str = Field(min_length=8, max_length=8_000_000)
    stock: int = Field(ge=0)
    featured: bool = False
    discountPercent: int = Field(default=0, ge=0, le=95)
    offerLabel: str = Field(default="", max_length=80)
    options: str = Field(default="", max_length=400)

    @field_validator("category")
    @classmethod
    def valid_category(cls, value: str) -> str:
        if value not in CATEGORIES:
            raise ValueError(f"Category must be one of: {', '.join(sorted(CATEGORIES))}")
        return value


class Product(ProductIn):
    id: str


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class OrderItem(BaseModel):
    productId: str
    quantity: int = Field(ge=1, le=99)
    option: str = Field(default="", max_length=120)


class CustomerInfo(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=5, max_length=40)
    email: EmailStr | None = None
    address: str = Field(min_length=5, max_length=220)
    city: str = Field(min_length=2, max_length=80)
    note: str = Field(default="", max_length=300)


class OrderCreate(BaseModel):
    customer: CustomerInfo
    items: list[OrderItem] = Field(min_length=1)
    paymentMethod: Literal["eSewa", "Mobile Banking", "Cash on Delivery"]
    paymentProof: str | None = Field(default=None, max_length=8_000_000)


class OrderStatusUpdate(BaseModel):
    status: Literal["New", "Confirmed", "Packed", "Delivered", "Cancelled"] | None = None
    paymentStatus: Literal["Awaiting payment", "Proof submitted", "Verified", "Rejected"] | None = None


class Order(BaseModel):
    id: str
    customer: CustomerInfo
    items: list[dict]
    subtotal: int
    deliveryFee: int
    total: int
    paymentMethod: str
    paymentProof: str | None = None
    paymentStatus: str = "Unpaid"
    status: str
    createdAt: str


def initialize_database() -> None:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
        connection.execute("PRAGMA busy_timeout=10000")
        connection.execute("CREATE TABLE IF NOT EXISTS store_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)")
        row = connection.execute("SELECT 1 FROM store_state WHERE id = 1").fetchone()
        if row is None:
            with DATA_PATH.open("r", encoding="utf-8") as file:
                initial_data = json.load(file)
            connection.execute(
                "INSERT INTO store_state (id, payload) VALUES (1, ?)",
                (json.dumps(initial_data),),
            )


def load_store() -> dict:
    with store_lock, sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
        connection.execute("PRAGMA busy_timeout=10000")
        row = connection.execute("SELECT payload FROM store_state WHERE id = 1").fetchone()
        if row is None:
            raise RuntimeError("Store database has not been initialized")
        return json.loads(row[0])


def save_store(data: dict) -> None:
    with store_lock, sqlite3.connect(DATABASE_PATH, timeout=10) as connection:
        connection.execute("PRAGMA busy_timeout=10000")
        connection.execute("UPDATE store_state SET payload = ? WHERE id = 1", (json.dumps(data),))


def require_admin(authorization: str | None = Header(default=None)) -> None:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin login required")
    token = authorization.removeprefix("Bearer ").strip()
    now = time()
    with session_lock:
        expires_at = admin_sessions.get(token)
        if expires_at is not None and expires_at <= now:
            admin_sessions.pop(token, None)
            expires_at = None
    if expires_at is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token")


def slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "-" for char in value)
    parts = [part for part in cleaned.split("-") if part]
    return "-".join(parts)[:48] or "product"


def public_payload(data: dict) -> dict:
    return {
        "site": data["site"],
        "categories": sorted(CATEGORIES),
        "products": data["products"],
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "Classsy Collection API"}


@app.get("/api/site")
def get_site() -> dict:
    return public_payload(load_store())


@app.put("/api/site", dependencies=[Depends(require_admin)])
def update_site(settings: SiteSettings) -> dict:
    data = load_store()
    data["site"] = settings.model_dump()
    save_store(data)
    return data["site"]


@app.get("/api/products", response_model=list[Product])
def list_products(category: str | None = None) -> list[dict]:
    products = load_store()["products"]
    if category:
        products = [product for product in products if product["category"] == category]
    return products


@app.post("/api/products", response_model=Product, dependencies=[Depends(require_admin)])
def create_product(product: ProductIn) -> dict:
    data = load_store()
    base_id = slugify(product.name)
    existing_ids = {item["id"] for item in data["products"]}
    product_id = base_id
    counter = 2
    while product_id in existing_ids:
        product_id = f"{base_id}-{counter}"
        counter += 1

    new_product = {"id": product_id, **product.model_dump()}
    data["products"].append(new_product)
    save_store(data)
    return new_product


@app.put("/api/products/{product_id}", response_model=Product, dependencies=[Depends(require_admin)])
def update_product(product_id: str, product: ProductIn) -> dict:
    data = load_store()
    for index, existing in enumerate(data["products"]):
        if existing["id"] == product_id:
            updated = {"id": product_id, **product.model_dump()}
            data["products"][index] = updated
            save_store(data)
            return updated
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")


@app.delete("/api/products/{product_id}", dependencies=[Depends(require_admin)])
def delete_product(product_id: str) -> dict:
    data = load_store()
    next_products = [product for product in data["products"] if product["id"] != product_id]
    if len(next_products) == len(data["products"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    data["products"] = next_products
    save_store(data)
    return {"deleted": product_id}


@app.post("/api/orders", response_model=Order)
def create_order(order: OrderCreate) -> dict:
    data = load_store()
    products_by_id = {product["id"]: product for product in data["products"]}
    prepared_items = []
    subtotal = 0
    requested_totals: dict[str, int] = {}

    for requested in order.items:
        product = products_by_id.get(requested.productId)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Product not found: {requested.productId}")
        if requested.quantity > product["stock"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only {product['stock']} left for {product['name']}",
            )
        requested_totals[product["id"]] = requested_totals.get(product["id"], 0) + requested.quantity
        available_options = [value.strip() for value in product.get("options", "").split(",") if value.strip()]
        if requested.option and requested.option not in available_options:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Option unavailable for {product['name']}")
        if available_options and not requested.option:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Choose an option for {product['name']}")
        discount = product.get("discountPercent", 0)
        unit_price = round(product["price"] * (100 - discount) / 100)
        line_total = unit_price * requested.quantity
        subtotal += line_total
        prepared_items.append(
            {
                "productId": product["id"],
                "name": product["name"],
                "category": product["category"],
                "style": product["style"],
                "option": requested.option,
                "price": unit_price,
                "listPrice": product["price"],
                "discountPercent": discount,
                "quantity": requested.quantity,
                "lineTotal": line_total,
            }
        )

    for product_id, requested_quantity in requested_totals.items():
        product = products_by_id[product_id]
        if requested_quantity > product["stock"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Only {product['stock']} left for {product['name']}")

    for requested in order.items:
        products_by_id[requested.productId]["stock"] -= requested.quantity

    delivery_fee = 150 if subtotal < 5000 else 0
    saved_order = {
        "id": f"CC-{uuid4().hex[:8].upper()}",
        "customer": order.customer.model_dump(),
        "items": prepared_items,
        "subtotal": subtotal,
        "deliveryFee": delivery_fee,
        "total": subtotal + delivery_fee,
        "paymentMethod": order.paymentMethod,
        "paymentProof": order.paymentProof,
        "paymentStatus": "Proof submitted" if order.paymentProof else ("Awaiting payment" if order.paymentMethod != "Cash on Delivery" else "Unpaid"),
        "status": "New",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    data["orders"].insert(0, saved_order)
    save_store(data)
    return saved_order


@app.get("/api/orders", response_model=list[Order], dependencies=[Depends(require_admin)])
def list_orders() -> list[dict]:
    return load_store()["orders"]


@app.put("/api/orders/{order_id}", response_model=Order, dependencies=[Depends(require_admin)])
def update_order(order_id: str, update: OrderStatusUpdate) -> dict:
    data = load_store()
    for index, order in enumerate(data["orders"]):
        if order["id"] == order_id:
            updated = deepcopy(order)
            if update.status is not None:
                updated["status"] = update.status
            if update.paymentStatus is not None:
                updated["paymentStatus"] = update.paymentStatus
            data["orders"][index] = updated
            save_store(data)
            return updated
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")


@app.post("/api/admin/login", response_model=LoginResponse)
def admin_login(credentials: LoginRequest) -> dict:
    username_matches = secrets.compare_digest(credentials.username, ADMIN_USERNAME)
    password_matches = secrets.compare_digest(credentials.password, ADMIN_PASSWORD)
    if not username_matches or not password_matches:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Wrong username or password")
    token = secrets.token_urlsafe(32)
    with session_lock:
        admin_sessions[token] = time() + ADMIN_SESSION_SECONDS
    return {"token": token}


@app.post("/api/admin/logout", dependencies=[Depends(require_admin)])
def admin_logout(authorization: str = Header(default="")) -> dict:
    token = authorization.removeprefix("Bearer ").strip()
    with session_lock:
        admin_sessions.pop(token, None)
    return {"status": "signed out"}


initialize_database()
