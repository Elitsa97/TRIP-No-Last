
from datetime import date, datetime
import pyodbc
import psycopg2
from psycopg2.extras import execute_values
import os
from dotenv import load_dotenv

load_dotenv()

# ---- ENV ----
SERVER_BC   = os.getenv("SERVER_BC")
PWD_BC      = os.getenv("PWD_BC")
DATABASE_URL = os.getenv("DATABASE_URL")

PG_HOST     = os.environ.get("PG_HOST")
PG_PORT     = int(os.environ.get("PG_PORT", "5432"))
PG_DB       = os.environ.get("PG_DB", "TRIP")
PG_USER     = os.environ.get("PG_USER", "postgres")
PG_PASSWORD = os.environ.get("PG_PASSWORD")

# 1) SQL Server (Business Central)
bc_conn = pyodbc.connect(
    "Driver={ODBC Driver 18 for SQL Server};"
    "Database=BC24;"
    f"Server=tcp:{SERVER_BC},1433;"
    "UID=NTZSQL;"
    f"PWD={PWD_BC};"
    "Encrypt=no;"
    "TrustServerCertificate=yes;"
    "Trusted_Connection=no;"
)
bc_cursor = bc_conn.cursor()

YEAR_FILTER = 2026  # можеш да смениш на диапазон при нужда

# 2) Postgres
pg_conn = psycopg2.connect(
    host=PG_HOST,
    port=PG_PORT,
    dbname=PG_DB,
    user=PG_USER,
    password=PG_PASSWORD,
    connect_timeout=10,
)
pg_cursor = pg_conn.cursor()

# 3) Нормализация (ползва се за диагностика)
def norm_space(s: str) -> str:
    if s is None:
        return ""
    s = s.replace("\u00A0", " ").replace("\u202F", " ")
    return " ".join(s.split()).strip()

HUBS = (
    "Хъб Ен Ти Зет Бургас NTZ",
    "Хъб Бургас",
    "Хъб Ен Ти Зет Пловдив NTZ",
    "Хъб Ен Ти Зет София",
    "Хъб Ен Ти Зет София NTZ",
    "Хъб Ен Ти Зет Тополи NTZ",
    "Хъб Ен Ти Зет Тополи",
)
ALLOWED_HUBS = {norm_space(x) for x in HUBS}  # само диагностично

# 4) SELECT от BC – вземаме ред rn=1 по (Trip No_, Address code)
SQL_BC = """
WITH src AS (
    SELECT
        [Trip No_],
        [Address name],
        [Action Code],
        [File],
        [Shipment No_],
        [Address code],
        [Sequence No_],
        [Starting Date],
        ROW_NUMBER() OVER (
            PARTITION BY [Trip No_], [Address code]
            ORDER BY
                CASE WHEN [Sequence No_] IS NULL THEN 1 ELSE 0 END,
                [Sequence No_] DESC
        ) AS rn
    FROM [NVT Route$0d6519c0-93fa-42a6-9b69-49ed3fb5fa66]
    WHERE YEAR([Starting Date]) = ?
      AND REPLACE(UPPER([Action Code]), ' ', '') LIKE '%DEPOT%'
)
SELECT
    [Trip No_],
    [Address name],
    [Action Code],
    [File],
    [Shipment No_],
    [Address code],
    [Sequence No_],
    [Starting Date]
FROM src
WHERE rn = 1;
"""
bc_cursor.execute(SQL_BC, (YEAR_FILTER,))
rows = bc_cursor.fetchall()
print(f"[BC] Прочетени общо: {len(rows)} реда за YEAR={YEAR_FILTER}")

# 5) Подготовка на данните за bc_trips
to_upsert = []
sample_not_in_allowed = 0

for r in rows:
    trip_no_raw = r[0]
    addr_raw    = r[1]
    action_raw  = r[2]
    file_raw    = r[3]
    ship_raw    = r[4]
    code_raw    = r[5]
    seq_raw     = r[6]
    sd          = r[7]

    trip_no     = (str(trip_no_raw).strip() if trip_no_raw is not None else None)
    addr_name   = (str(addr_raw).strip()    if addr_raw    is not None else None)
    action_code = (str(action_raw).strip()  if action_raw  is not None else None)
    file_name   = (str(file_raw).strip()    if file_raw    is not None else None)
    shipment_no = (str(ship_raw).strip()    if ship_raw    is not None else None)
    address_code= (str(code_raw).strip()    if code_raw    is not None else None)
    sequence_no = (int(seq_raw) if seq_raw is not None else None)

    if addr_name and norm_space(addr_name) not in ALLOWED_HUBS:
        sample_not_in_allowed += 1  # само диагностично

    if isinstance(sd, datetime):
        starting_date = sd.date()
    elif isinstance(sd, date):
        starting_date = sd
    elif sd is None:
        starting_date = None
    else:
        try:
            starting_date = datetime.fromisoformat(str(sd)).date()
        except Exception:
            starting_date = None

    # изхвърляме редове без trip_no или без address_code (за да пазим уникалност)
    if trip_no and address_code:
        to_upsert.append((
            trip_no, address_code, addr_name, action_code, file_name,
            shipment_no, sequence_no, starting_date
        ))

print(f"[BC] За bc_trips ще запишем: {len(to_upsert)} реда (извън ALLOWED_HUBS по име: ~{sample_not_in_allowed}, информативно)")

# 6) Увери се, че bc_trips съществува с нужните ограничения
pg_cursor.execute("""
CREATE TABLE IF NOT EXISTS public.bc_trips (
    trip_no       TEXT NOT NULL,
    address_code  TEXT NOT NULL,
    address_name  TEXT,
    action_code   TEXT,
    file_name     TEXT,
    shipment_no   TEXT,
    sequence_no   BIGINT,
    starting_date DATE,
    loaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ux_bc_trips_trip_addr UNIQUE (trip_no, address_code)
);
""")
pg_conn.commit()

# 7) UPSERT в bc_trips (по (trip_no, address_code))
if not to_upsert:
    print("[INFO] Няма валидни TRIP редове за запис.")
else:
    sql_upsert = """
        INSERT INTO public.bc_trips
            (trip_no, address_code, address_name, action_code, file_name, shipment_no, sequence_no, starting_date)
        VALUES %s
        ON CONFLICT (trip_no, address_code) DO UPDATE
        SET address_name  = EXCLUDED.address_name,
            action_code   = EXCLUDED.action_code,
            file_name     = EXCLUDED.file_name,
            shipment_no   = EXCLUDED.shipment_no,
            sequence_no   = EXCLUDED.sequence_no,
            starting_date = EXCLUDED.starting_date,
            loaded_at     = NOW();
    """
    execute_values(
        pg_cursor,
        sql_upsert,
        to_upsert,
        template="(%s,%s,%s,%s,%s,%s,%s,%s)",
        page_size=1000
    )
    pg_conn.commit()
    print(f"[PG] bc_trips: записани/обновени редове = {len(to_upsert)}")

# 8) МАПИНГ: Trip → Hub по нормализирани имена (1 TRIP -> 1 HUB)
# Изисква: public.trip_hub_map(trip_no PRIMARY KEY, hub_id NOT NULL)
#          public.hub_aliases(alias_norm TEXT, hub_id INT)
#          public.norm_text(TEXT) -> TEXT (нормализация)
pg_cursor.execute("""
CREATE TABLE IF NOT EXISTS public.trip_hub_map (
    trip_no TEXT NOT NULL,
    hub_id  INT  NOT NULL
);
""")
pg_conn.commit()

# Ако нямаш функцията, създай я (виж DDL секцията по-долу)

sql_map = """
INSERT INTO public.trip_hub_map (trip_no, hub_id)
SELECT DISTINCT b.trip_no, ha.hub_id
FROM public.bc_trips b
JOIN public.hub_aliases ha
  ON ha.alias_norm = public.norm_text(b.address_name)
ON CONFLICT ON CONSTRAINT ux_trip_hub DO NOTHING;

"""
pg_cursor.execute(sql_map)
pg_conn.commit()
print("[PG] trip_hub_map: синхронизиран (join по alias_norm = norm_text(address_name))")

# Диагностика – колко bc_trips адреси имат alias мач
pg_cursor.execute("""
SELECT COUNT(*)
FROM (
  SELECT DISTINCT public.norm_text(address_name) AS addr_norm
  FROM public.bc_trips
) b
JOIN public.hub_aliases ha ON ha.alias_norm = b.addr_norm
""")
print("[PG] trip→hub joinable rows (by alias):", pg_cursor.fetchone()[0])

# Cleanup
pg_cursor.close()
pg_conn.close()
bc_cursor.close()
bc_conn.close()
print("Ready!")