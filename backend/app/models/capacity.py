import uuid
from datetime import date
from typing import TYPE_CHECKING

from app.database import Base
from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

if TYPE_CHECKING:
    from app.models.worker import Worker


class WorkerDailyCapacity(Base):
    __tablename__ = "worker_daily_capacities"
    __table_args__ = (UniqueConstraint("worker_id", "capacity_date", name="uix_worker_capacity_date"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id: Mapped[str] = mapped_column(String(36), ForeignKey("workers.id", ondelete="CASCADE"), nullable=False)
    capacity_date: Mapped[date] = mapped_column(Date, nullable=False)
    max_daily_capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated_for_date: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    worker: Mapped["Worker"] = relationship("Worker", back_populates="capacities")

    @property
    def remaining_capacity_for_date(self) -> int:
        return max(0, self.max_daily_capacity - self.allocated_for_date)
