
import os

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI
from psycopg import OperationalError

load_dotenv()

app = FastAPI(
    title="AI Data Guardian 3.0 Backend",
    version="1.0.0"
)


def database_config():
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "dbname": os.getenv("DB_NAME", "customer_db"),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", ""),
        "connect_timeout": 5,
    }


@app.get("/")
def home():
    return {
        "application": "AI Data Guardian 3.0",
        "backend": "FastAPI",
        "status": "running"
    }


@app.get("/api/v1/health")
def health():
    return {
        "service": "Python Backend",
        "status": "healthy"
    }


@app.get("/api/v1/database/health")
def database_health():
    try:
        with psycopg.connect(**database_config()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT current_database()")
                database_name = cursor.fetchone()[0]

        return {
            "service": "PostgreSQL",
            "status": "connected",
            "database": database_name
        }

    except (OperationalError, psycopg.Error, ValueError):
        return {
            "service": "PostgreSQL",
            "status": "disconnected",
            "database": None
        }

@app.get("/api/v1/database/tables")
def list_database_tables():
    try:
        with psycopg.connect(**database_config()) as conn:
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                      AND table_type = 'BASE TABLE'
                    ORDER BY table_name;
                    """
                )

                tables = [
                    row[0]
                    for row in cursor.fetchall()
                ]

        return {
            "database": os.getenv("DB_NAME", "customer_db"),
            "status": "success",
            "total_tables": len(tables),
            "tables": tables
        }

    except (psycopg.Error, ValueError):
        return {
            "database": os.getenv("DB_NAME", "customer_db"),
            "status": "error",
            "total_tables": 0,
            "tables": [],
            "message": "Unable to retrieve database tables"
        }
