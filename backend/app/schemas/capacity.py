from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CapacityCreate(BaseModel):
    worker_id: str
    capacity_date: date
    max_daily_capacity: int = Field(..., gt=0)
    allocated_for_date: int = Field(0, ge=0)


class CapacityUpdate(BaseModel):
    max_daily_capacity: int = Field(..., gt=0)
    allocated_for_date: int = Field(0, ge=0)


class CapacityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    worker_id: str
    capacity_date: date
    max_daily_capacity: int
    allocated_for_date: int
    remaining_capacity_for_date: int
