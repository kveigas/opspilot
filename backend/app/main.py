from contextlib import asynccontextmanager

from app.api.v1 import (
    allocations,
    audit,
    calibrations,
    campaigns,
    capacity,
    delivery,
    demo,
    escalations,
    health,
    qualifications,
    reviews,
    sla,
    tasks,
    today,
    workers,
)
from app.config import API_V1_STR, CORS_ORIGINS, PROJECT_NAME, VERSION
from app.database import init_db
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


def create_app() -> FastAPI:
    app_instance = FastAPI(
        title=PROJECT_NAME,
        version=VERSION,
        openapi_url=f"{API_V1_STR}/openapi.json",
        lifespan=lifespan,
    )

    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app_instance.include_router(health.router, prefix=API_V1_STR)
    app_instance.include_router(campaigns.router, prefix=API_V1_STR)
    app_instance.include_router(workers.router, prefix=API_V1_STR)
    app_instance.include_router(capacity.router, prefix=API_V1_STR)
    app_instance.include_router(calibrations.router, prefix=API_V1_STR)
    app_instance.include_router(qualifications.router, prefix=API_V1_STR)
    app_instance.include_router(audit.router, prefix=API_V1_STR)
    app_instance.include_router(tasks.router, prefix=API_V1_STR)
    app_instance.include_router(allocations.router, prefix=API_V1_STR)
    app_instance.include_router(reviews.router, prefix=API_V1_STR)
    app_instance.include_router(escalations.router, prefix=API_V1_STR)
    app_instance.include_router(sla.router, prefix=API_V1_STR)
    app_instance.include_router(delivery.router, prefix=API_V1_STR)
    app_instance.include_router(today.router, prefix=API_V1_STR)
    app_instance.include_router(demo.router, prefix=API_V1_STR)

    @app_instance.get("/health")
    def health_root():
        return {
            "status": "healthy",
            "service": "OpsPilot API",
            "phase": "RC1",
        }

    @app_instance.get("/")
    def root():
        return {
            "name": PROJECT_NAME,
            "version": VERSION,
            "status": "active",
            "message": "OpsPilot API Active",
            "docs": "/docs",
            "health": f"{API_V1_STR}/health",
        }

    return app_instance


app = create_app()
