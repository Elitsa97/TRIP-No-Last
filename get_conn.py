import os
from dotenv import load_dotenv
import psycopg2
load_dotenv()

def get_pg_conn():
    host = os.environ.get("PG_HOST")
    port = os.environ.get("PG_PORT")
    db   = os.environ.get("PG_DB")
    user = os.environ.get("PG_USER")
    pwd  = os.environ.get("PG_PASSWORD")
    sslm = os.getenv("PG_SSLMODE")

    missing = [k for k,v in {"PG_HOST": host, "PG_DB":db, "PG_USER":user, "PG_PASSWORD":pwd}.items() if not v]
    if missing:
        raise RuntimeError(f"Липсват PG променливи: {', '.join(missing)}")

    return psycopg2.connect(
        host= host,
        port=port,
        dbname=db,    
        user=user,
        password=pwd,   
        connect_timeout=10
    )

    # kwargs = dict(
    #     host=host,
    #     port=port,
    #     dbname=db,
    #     user=user,
    #     password=pwd,
    #     connect_timeout=10
    # )
    # if sslm:
    #     kwargs["sslmode"] = sslm

    # return psycopg2.connect(**kwargs)
