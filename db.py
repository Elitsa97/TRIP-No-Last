import os
import sqlite3

from sqlalchemy import create_engine

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'db.sqlite3')
# DATABASE_URL = os.environ.get("DATABASE_URL")
# engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL
            )
        ''')

        
        c.execute("""
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            owner_admin_id INTEGER NULL,
            owner_admin_username TEXT NULL,
            is_active INTEGER NULL,
            created_at TEXT NULL
        )
        """)


        c.execute('''
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_no TEXT NOT NULL,
                user_id INTEGER NOT NULL,
                start_ts TEXT NOT NULL,   -- ISO: YYYY-MM-DDTHH:MM:SS
                end_ts TEXT,              -- ISO
                minutes INTEGER,          -- цяло число минути
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                    );
        ''')

        c.execute('''
            CREATE UNIQUE INDEX IF NOT EXISTS idx_active_unique
                ON sessions(user_id, order_no)
            WHERE end_ts IS NULL;
        ''')

        
        c.execute("""
        CREATE TABLE IF NOT EXISTS hubs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS hubs_admins (
            hub_id INTEGER NOT NULL,
            admin_user_id INTEGER NOT NULL,
            PRIMARY KEY (hub_id, admin_user_id),
            FOREIGN KEY(hub_id) REFERENCES hubs(id) ON DELETE CASCADE,
            FOREIGN KEY(admin_user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)
        c.execute("""
        CREATE TABLE IF NOT EXISTS trip_hub_map (
            trip_no TEXT PRIMARY KEY,
            hub_id INTEGER NOT NULL,
            FOREIGN KEY(hub_id) REFERENCES hubs(id) ON DELETE CASCADE
        );
        """)
        conn

        conn.commit()


# with get_conn() as conn:
#     c = conn.cursor()
#     c.execute(
# "UPDATE users SET role='superadmin' WHERE username=?", ('Admin',))
#     conn.commit()


