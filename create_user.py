from functools import wraps
import os
from flask import jsonify, redirect, render_template, session, url_for
from werkzeug.security import generate_password_hash
from datetime import datetime, timezone
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from get_conn import get_pg_conn
load_dotenv()

ENC_KEY = os.environ.get("PG_ENC_KEY", "CHANGE_ME")


# -----------------------
# Helpers (normalize/TRIP)
# -----------------------
def ensure_trip_prefix(order_no: str, prefix: str = "TRIP-") -> str:
    order_no = (order_no or "").strip()
    up = order_no.upper()
    if not up.startswith(prefix):
        # премахни повтарящ се префикс и добави точното в началото
        cleaned = up.removeprefix(prefix).strip()
        return prefix + cleaned
    return up


# -----------------------
# Current user (PG only)
# -----------------------
def get_current_user():
    if session.get("auth_source") != "pg":
        session.clear()
        return None

    table = session.get("pg_table")
    uname = session.get("username")
    if not uname or not table:
        session.clear()
        return None

    try:
        with get_pg_conn() as pg:
            with pg.cursor(cursor_factory=RealDictCursor) as cur:
                if table == "users":  # superadmin тук
                    cur.execute("""
                        SELECT id, username, role
                        FROM public.users
                        WHERE username = %s
                        LIMIT 1
                    """, (uname,))
                    row = cur.fetchone()
                    if not row or (row.get("role") or "").lower() != "superadmin":
                        session.clear()
                        return None
                    return {"id": row["id"], "username": row["username"], "role": "superadmin", "source": "pg"}

                elif table == "admin_users":
                    cur.execute("""
                        SELECT id, username, role, COALESCE(is_active, TRUE) AS is_active
                        FROM public.admin_users
                        WHERE username = %s
                        LIMIT 1
                    """, (uname,))
                    row = cur.fetchone()
                    if not row or not row.get("is_active", True):
                        session.clear()
                        return None
                    return {"id": row["id"], "username": row["username"], "role": (row["role"] or "").lower(), "source": "pg"}

                else:
                    session.clear()
                    return None
    except Exception:
        session.clear()
        return None


# -----------------------
# Create users (PG only)
# -----------------------
def create_user(username: str, password: str, role: str = "user") -> int:
    """
    Създава user в public.admin_users. Поддържа роли: user|admin|superadmin.
    Връща новия id.
    """
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password cannot be empty.")
    if role not in ("user", "admin", "superadmin"):
        raise ValueError("Role must be 'user', 'admin' or 'superadmin'.")

    ph = generate_password_hash(password)

    with get_pg_conn() as pg:
        with pg.cursor() as cur:
            cur.execute("SELECT 1 FROM public.admin_users WHERE username = %s", (username,))
            if cur.fetchone():
                raise ValueError(f"Username {username} already exists.")

            cur.execute("""
                INSERT INTO public.admin_users (username, password_hash, role, is_active, created_at, updated_at)
                VALUES (%s, %s, %s, TRUE, NOW(), NOW())
                RETURNING id
            """, (username, ph, role))
            new_id = cur.fetchone()[0]
        pg.commit()
    return int(new_id)

def create_user_scoped(username: str, password: str, role: str = "user") -> int:
    """
    Създава user, обвързан с текущия админ (owner_admin_username).
    Само admin/superadmin могат да създават.
    """
    current = get_current_user()
    if not current or current["role"] not in ("admin", "superadmin"):
        raise PermissionError("Само администратор може да създава потребители.")

    username = (username or "").strip()
    if not username or not password:
        raise ValueError("username и password са задължителни")
    if role not in ("user", "admin", "superadmin"):
        raise ValueError("role трябва да е 'user', 'admin' или 'superadmin'")

    ph = generate_password_hash(password)

    owner_admin_username = None
    if role in ("user", "admin"):
        owner_admin_username = current["username"]  # superadmin не е owner

    with get_pg_conn() as pg:
        with pg.cursor() as cur:
            cur.execute("SELECT 1 FROM public.admin_users WHERE username=%s", (username,))
            if cur.fetchone():
                raise ValueError(f"Потребител {username} вече съществува.")

            cur.execute("""
                INSERT INTO public.admin_users
                    (username, password_hash, role, is_active,
                     owner_admin_username, created_at, updated_at)
                VALUES (%s, %s, %s, TRUE, %s, NOW(), NOW())
                RETURNING id
            """, (username, ph, role, owner_admin_username))
            new_id = cur.fetchone()[0]
        pg.commit()
    return int(new_id)

def create_user_scoped_with_hash(username: str, password_hash: str, role: str, owner_admin_username: str | None):
    """
    Вариант с готов hash (напр. при миграции). НЕ приемаме plaintext.
    """
    username = (username or "").strip()
    if not username or not password_hash:
        raise ValueError("username и password_hash са задължителни")
    if role not in ("user", "admin", "superadmin"):
        raise ValueError("role трябва да е 'user', 'admin' или 'superadmin'")

    if role == "superadmin":
        owner_admin_username = None

    with get_pg_conn() as pg:
        with pg.cursor() as cur:
            cur.execute("SELECT 1 FROM public.admin_users WHERE username=%s", (username,))
            if cur.fetchone():
                raise ValueError(f"Потребител {username} вече съществува.")

            cur.execute("""
                INSERT INTO public.admin_users
                    (username, password_hash, role, is_active,
                     owner_admin_username, created_at, updated_at)
                VALUES (%s, %s, %s, TRUE, %s, NOW(), NOW())
            """, (username, password_hash, role, owner_admin_username))
        pg.commit()


# -----------------------
# Hub & Trip map helpers
# -----------------------
def upsert_hub(pg_conn, hub_name: str) -> int:
    """
    Връща hub_id. Изисква да имаш UNIQUE индекс по hubs(name) или да гарантираш уникалност.
    """
    hub_name = (hub_name or "").strip()
    if not hub_name:
        raise ValueError("hub_name е задължителен")

    with pg_conn.cursor() as cur:
        cur.execute("SELECT id FROM public.hubs WHERE name = %s LIMIT 1", (hub_name,))
        row = cur.fetchone()
        if row:
            return int(row[0])

        cur.execute("""
            INSERT INTO public.hubs(name)
            VALUES (%s)
            ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        """, (hub_name,))
        return int(cur.fetchone()[0])

def upsert_trip_hub(pg_conn, trip_no: str, hub_name: str):
    """
    Осигурява връзка TRIP -> HUB (по име), като създава HUB при нужда.
    """
    trip_no = (trip_no or "").strip()
    hub_name = (hub_name or "").strip()
    if not trip_no or not hub_name:
        raise ValueError("trip_no и hub_name са задължителни")

    hub_id = upsert_hub(pg_conn, hub_name)
    with pg_conn.cursor() as cur:
        cur.execute("""
            INSERT INTO public.trip_hub_map (trip_no, hub_id)
            VALUES (%s, %s)
            ON CONFLICT (trip_no) DO UPDATE SET hub_id = EXCLUDED.hub_id
        """, (trip_no, hub_id))


# -----------------------
# Permissions / Allowed hubs
# -----------------------
def get_allowed_hub_ids_for_user(current):
    """
    Връща set от hub_id, позволени за текущия user според ролята.
    - superadmin: всички hubs
    - admin: hubs от hubs_admins(admin_username)
    - user: hubs на неговия owner_admin_username
    """
    hub_ids = set()
    if not current:
        return hub_ids

    try:
        with get_pg_conn() as pg:
            with pg.cursor() as cur:
                role = (current.get("role") or "").lower()
                uname = current.get("username")

                if role == "superadmin":
                    cur.execute("SELECT id FROM public.hubs")
                    hub_ids = {int(r[0]) for r in cur.fetchall() if r and r[0] is not None}

                elif role == "admin":
                    cur.execute("""
                        SELECT ha.hub_id
                        FROM public.hubs_admins ha
                        WHERE LOWER(ha.admin_username) = LOWER(%s)
                    """, (uname,))
                    hub_ids = {int(r[0]) for r in cur.fetchall() if r and r[0] is not None}

                else:  # operator (user)
                    cur.execute("""
                        SELECT owner_admin_username
                        FROM public.admin_users
                        WHERE LOWER(username) = LOWER(%s)
                        LIMIT 1
                    """, (uname,))
                    row = cur.fetchone()
                    owner_admin_username = row[0] if row else None
                    if not owner_admin_username:
                        return set()

                    cur.execute("""
                        SELECT ha.hub_id
                        FROM public.hubs_admins ha
                        WHERE LOWER(ha.admin_username) = LOWER(%s)
                    """, (owner_admin_username,))
                    hub_ids = {int(r[0]) for r in cur.fetchall() if r and r[0] is not None}

    except Exception as e:
        print("[PG] get_allowed_hub_ids_for_user error:", e, flush=True)
        return set()

    return hub_ids

def ensure_pg_admin_user_mirror(username: str, role: str, owner_creator: dict):
    """
    Гарантира, че в admin_users:
    - създателят (admin/superadmin) съществува
    - целевият user съществува/се обновява, като се пази owner_admin_username
    """
    creator_username = owner_creator["username"]
    creator_role = owner_creator["role"]

    with get_pg_conn() as pg:
        with pg.cursor() as cur:
            # 1) гарантирай създателя
            cur.execute("SELECT 1 FROM public.admin_users WHERE username = %s", (creator_username,))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO public.admin_users (username, role, is_active, created_at, updated_at)
                    VALUES (%s, %s, TRUE, NOW(), NOW())
                """, (creator_username, creator_role))

            # 2) целевият user
            cur.execute("SELECT 1 FROM public.admin_users WHERE username = %s", (username,))
            exists = cur.fetchone() is not None

            if role in ("user", "admin"):
                if exists:
                    cur.execute("""
                        UPDATE public.admin_users
                           SET role = %s,
                               is_active = TRUE,
                               owner_admin_username = %s,
                               updated_at = NOW()
                         WHERE username = %s
                    """, (role, creator_username, username))
                else:
                    cur.execute("""
                        INSERT INTO public.admin_users (username, role, is_active, owner_admin_username, created_at, updated_at)
                        VALUES (%s, %s, TRUE, %s, NOW(), NOW())
                    """, (username, role, creator_username))
            else:  # superadmin
                if exists:
                    cur.execute("""
                        UPDATE public.admin_users
                           SET role = %s,
                               is_active = TRUE,
                               owner_admin_username = NULL,
                               updated_at = NOW()
                         WHERE username = %s
                    """, (role, username))
                else:
                    cur.execute("""
                        INSERT INTO public.admin_users (username, role, is_active, owner_admin_username, created_at, updated_at)
                        VALUES (%s, %s, TRUE, NULL, NOW(), NOW())
                    """, (username, role))
        pg.commit()

def is_user_allowed_for_trip(pg, order_no: str, username: str, role: str) -> bool:
    """
    Позволение за TRIP: проверява се по hub_id на TRIP срещу hubs_admins.
    """
    with pg.cursor() as cur:
        r = (role or "").lower()

        if r == "superadmin":
            return True

        if r == "admin":
            cur.execute("""
                SELECT EXISTS (
                    SELECT 1
                    FROM public.trip_hub_map   AS m
                    JOIN public.hubs_admins    AS ha
                      ON ha.hub_id = m.hub_id
                   WHERE m.trip_no = %s
                     AND LOWER(ha.admin_username) = LOWER(%s)
                )
            """, (order_no, username))
            return bool(cur.fetchone()[0])

        # operator
        cur.execute("""
            SELECT EXISTS (
                SELECT 1
                FROM public.trip_hub_map  AS m
                JOIN public.admin_users   AS au
                  ON LOWER(au.username) = LOWER(%s)
                JOIN public.hubs_admins  AS ha
                  ON ha.hub_id = m.hub_id
                 AND LOWER(ha.admin_username) = LOWER(au.owner_admin_username)
               WHERE m.trip_no = %s
            )
        """, (username, order_no))
        return bool(cur.fetchone()[0])

def is_user_allowed_for_hub(pg, hub_id: int, username: str, role: str) -> bool:
    with pg.cursor() as cur:
        r = (role or "").lower()

        # По политика ти: superadmin не стартира таймер; все пак връщаме False
        if r == "superadmin":
            return False

        if r == "admin":
            cur.execute("""
                SELECT 1
                FROM public.hubs_admins ha
                WHERE ha.hub_id = %s
                  AND LOWER(ha.admin_username) = LOWER(%s)
                LIMIT 1
            """, (hub_id, username))
            return cur.fetchone() is not None

        # operator (user): owner_admin_username -> hubs_admins
        cur.execute("""
            SELECT owner_admin_username
            FROM public.admin_users
            WHERE LOWER(username) = LOWER(%s)
            LIMIT 1
        """, (username,))
        row = cur.fetchone()
        if not row or not row[0]:
            return False

        owner_admin_username = row[0]
        cur.execute("""
            SELECT 1
            FROM public.hubs_admins ha
            WHERE ha.hub_id = %s
              AND LOWER(ha.admin_username) = LOWER(%s)
            LIMIT 1
        """, (hub_id, owner_admin_username))
        return cur.fetchone() is not None


# -----------------------
# Decorators (unchanged)
# -----------------------
def login_required_json(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not get_current_user():
            return jsonify({"ok": False, "error": "Нужен е вход."}), 401
        return fn(*args, **kwargs)
    return wrapper

def login_required_page(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not get_current_user():
            return redirect(url_for("login"))
        return fn(*args, **kwargs)
    return wrapper

def admin_required_page(fn):
    """За страници (HTML): допуска само admin/superadmin, иначе праща към login или /."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return redirect(url_for("login"))
        if user.get("role") not in ("admin", "superadmin"):
            return redirect(url_for("index"))
        return fn(*args, **kwargs)
    return wrapper

def admin_required_json(fn):
    """За JSON/API: допуска само admin/superadmin, иначе връща 401/403 JSON."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({"ok": False, "error": "Нужен е вход."}), 401
        if user.get("role") not in ("admin", "superadmin"):
            return jsonify({"ok": False, "error": "Само администратор има достъп."}), 403
        return fn(*args, **kwargs)
    return wrapper

def superadmin_required_page(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return redirect(url_for("login"))
        if user.get("role") != "superadmin":
            return redirect(url_for("index"))
        return fn(*args, **kwargs)
    return wrapper

def superadmin_required_json(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        u = get_current_user()
        if not u or u.get("role") != "superadmin":
            return jsonify({"ok": False, "error": "Само супер администратор има достъп."}), 403
        return fn(*args, **kwargs)
    return wrapper

def admin_or_super_required_json(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        u = get_current_user()
        if not u or u.get("role") not in ("admin", "superadmin"):
            return jsonify({"ok": False, "error": "Само администратор/суперадмин има достъп."}), 403
        return fn(*a, **kw)
    return wrapper

