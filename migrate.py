import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

# # Взимаш connection string от environment variables
# DATABASE_URL = os.getenv("DATABASE_URL")

# conn = psycopg2.connect(DATABASE_URL)
# cur = conn.cursor()

# # Пътят към SQL файла вътре в проекта
# sql_file = "migrations/backup.sql"

# with open(sql_file, "r", encoding="utf-8") as f:
#     sql_commands = f.read()

# cur.execute(sql_commands)
# conn.commit()

# cur.close()
# conn.close()

# print("Migration completed successfully.")


# Вземаме connection string от променлива на средата
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Липсва DATABASE_URL в env variables.")

SQL_FILE = os.getenv("SQL_FILE_PATH", "migrations/backup.sql")

def run_sql_file(conn, path):
    # Изпълняваме на парчета, за да не препълним буфери
    # Този подход очаква dump с INSERT-и (pg_dump --inserts).
    with open(path, "r", encoding="utf-8") as f:
        sql_buffer = []
        cur = conn.cursor()
        stmt_count, batch_count = 0, 0

        for line in f:
            # Прескачаме чисто коментарни редове
            if line.strip().startswith("--"):
                continue
            sql_buffer.append(line)
            # Изпращаме команди при ';' в края на реда (в повечето dump-ове това е OK)
            if line.rstrip().endswith(";"):
                stmt = "".join(sql_buffer).strip()
                if stmt:
                    cur.execute(stmt)
                    stmt_count += 1
                sql_buffer = []
                # На всяка N команди – commit (за да не държим транзакция твърде дълго)
                if stmt_count % 200 == 0:
                    conn.commit()
                    batch_count += 1
                    print(f"Изпълнени {stmt_count} команди, batch commits: {batch_count}")

        # Останало съдържание без ';' накрая (рядко) – изпълняваме:
        trailing = "".join(sql_buffer).strip()
        if trailing:
            cur.execute(trailing)

        conn.commit()
        cur.close()
        print(f"Готово. Общо изпълнени команди: {stmt_count + (1 if trailing else 0)}")

def main():
    # sslmode=require е в самия DATABASE_URL; не го слагаме отделно
    conn = psycopg2.connect(DATABASE_URL)
    # Добра идея е autocommit за DDL-heavy dump, но тук комитваме ръчно:
    # conn.autocommit = True
    try:
        with conn:
            with conn.cursor() as c:
                c.execute("SET client_encoding TO 'UTF8';")
        run_sql_file(conn, SQL_FILE)
    finally:
        conn.close()

if __name__ == "__main__":
    main()