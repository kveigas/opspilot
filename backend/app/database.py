from collections.abc import Generator

from app.config import DATABASE_URL
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Nullable columns added after RC1. create_all() never alters existing tables, so older
# databases receive them through additive, non-destructive ALTER TABLE statements.
ADDITIVE_COLUMNS: dict[str, dict[str, str]] = {
    "tasks": {"qa_sample_probability": "FLOAT", "qa_sampling_tier": "VARCHAR(20)"},
    "campaigns": {"qa_policy": "VARCHAR(20)"},
    "allocation_runs": {"strategy": "VARCHAR(20)"},
}


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_additive_columns(bind: Engine) -> list[str]:
    inspector = inspect(bind)
    added: list[str] = []
    with bind.begin() as connection:
        for table, columns in ADDITIVE_COLUMNS.items():
            if not inspector.has_table(table):
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, sql_type in columns.items():
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))
                    added.append(f"{table}.{name}")
    return added


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_additive_columns(engine)
