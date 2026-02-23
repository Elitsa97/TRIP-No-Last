# assign_hubs_to_admins_pg.py  (PG-only)
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

PG_HOST = os.environ.get("PG_HOST")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_DB   = os.environ.get("PG_DB", "TRIP")
PG_USER = os.environ.get("PG_USER", "postgres")
PG_PASS = os.environ.get("PG_PASSWORD", "")

def get_pg_conn():
    return psycopg2.connect(port=PG_PORT, dbname=PG_DB, user=PG_USER, password=PG_PASS)

def norm_space(s: str) -> str:
    return " ".join((s or "").replace("\u00A0"," ").replace("\u202F"," ").split()).strip()

# целевият мап: Админ -> Списък Хъбове (имената са „красиви“; ще нормализираме към name_norm)
MAP = {
    "WHS_Sofia":   ["Хъб Ен Ти Зет София", "Хъб Ен Ти Зет София NTZ"],
    "WHS_Topoli":  ["Хъб Ен Ти Зет Тополи NTZ", "Хъб Ен Ти Зет Тополи"],
    "WHS_Burgas":  ["Хъб Ен Ти Зет Бургас NTZ", "Хъб Бургас"],
    "WHS_Plovdiv": ["Хъб Ен Ти Зет Пловдив NTZ"],
}

def ensure_hubs_schema(cur):
    # 1) name_norm + уникалност
    cur.execute("ALTER TABLE public.hubs ADD COLUMN IF NOT EXISTS name_norm text;")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hubs_name_norm ON public.hubs(name_norm);")
    cur.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hubs_name_norm_key') THEN
            ALTER TABLE public.hubs
              ADD CONSTRAINT hubs_name_norm_key UNIQUE USING INDEX idx_hubs_name_norm;
          END IF;
        END $$;
    """)
    # 2) hubs_admins с (hub_id, admin_username)
    cur.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema='public' AND table_name='hubs_admins'
          ) THEN
            CREATE TABLE public.hubs_admins (
              hub_id         integer NOT NULL REFERENCES public.hubs(id) ON DELETE CASCADE,
              admin_username text    NOT NULL,
              PRIMARY KEY (hub_id, admin_username)
            );
          END IF;
        END $$;
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_hubs_admins_admin_username ON public.hubs_admins(admin_username);")

def main():
    with get_pg_conn() as pg:
        with pg.cursor() as cur:
            ensure_hubs_schema(cur)
        pg.commit()

        with pg.cursor() as cur:
            for admin_username, hubs in MAP.items():
                # 1) валидирай, че админът съществува в PG и има роля admin/superadmin
                cur.execute("""
                    SELECT role, is_active
                      FROM public.admin_users
                     WHERE username = %s
                """, (admin_username,))
                row = cur.fetchone()
                if not row:
                    print(f"[WARN] Липсва админ в PG: {admin_username} – пропускам.")
                    continue
                role, is_active = row
                if role not in ("admin", "superadmin"):
                    print(f"[WARN] {admin_username} не е admin/superadmin – пропускам.")
                    continue
                if not is_active:
                    print(f"[WARN] {admin_username} е деактивиран – пропускам.")
                    continue

                for hub_name in hubs:
                    hub_norm = norm_space(hub_name)

                    # 2) UPSERT в hubs по name_norm (name = „красивото“ име)
                    cur.execute("""
                        INSERT INTO public.hubs(name, name_norm)
                        VALUES (%s, %s)
                        ON CONFLICT (name_norm) DO UPDATE
                           SET name = EXCLUDED.name
                    """, (hub_name, hub_norm))

                    # 3) вземи hub_id
                    cur.execute("SELECT id FROM public.hubs WHERE name_norm=%s", (hub_norm,))
                    h = cur.fetchone()
                    if not h:
                        print(f"[ERR] Неуспешно намиране на hub '{hub_norm}' – пропускам.")
                        continue
                    hub_id = h[0]

                    # 4) свържи хъб -> админ по username
                    cur.execute("""
                        INSERT INTO public.hubs_admins (hub_id, admin_username)
                        VALUES (%s, %s)
                        ON CONFLICT (hub_id, admin_username) DO NOTHING
                    """, (hub_id, admin_username))
                    print(f"[OK] {admin_username} ⇐ {hub_norm}")

        pg.commit()
    print("Готово.")

if __name__ == "__main__":
    main()