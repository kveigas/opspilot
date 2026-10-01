"""Composable service transactions: one commit per operation, including its audit trail."""
from collections.abc import Callable
from functools import wraps
from typing import Concatenate

from sqlalchemy.orm import Session

_ACTIVE = "opspilot_unit_of_work"


def atomic[**P, R](operation: Callable[Concatenate[Session, P], R]) -> Callable[Concatenate[Session, P], R]:
    """Own the request session's transaction; nested services only flush.

    Callers must not pass unrelated pending writes in the same session.
    Exceptions propagate and the outermost service rolls back every nested change.
    """
    @wraps(operation)
    def wrapped(db: Session, *args: P.args, **kwargs: P.kwargs) -> R:
        if db.info.get(_ACTIVE):
            return operation(db, *args, **kwargs)
        db.info[_ACTIVE] = True
        try:
            # SQLite has no row-level FOR UPDATE. Acquire its writer reservation
            # before reading allocation/state inputs, including across processes.
            if db.get_bind().dialect.name == "sqlite":
                connection = db.connection()
                driver = connection.connection.driver_connection
                if not getattr(driver, "in_transaction", False):
                    connection.exec_driver_sql("BEGIN IMMEDIATE")
            result = operation(db, *args, **kwargs)
            db.commit()
            return result
        except Exception:
            db.rollback()
            raise
        finally:
            db.info.pop(_ACTIVE, None)
    return wrapped
