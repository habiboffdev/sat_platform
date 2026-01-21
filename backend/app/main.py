from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
        redoc_url=f"{settings.api_v1_prefix}/redoc",
        lifespan=lifespan,
    )

    # CORS middleware - allow all origins in development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # Must be False when using ["*"]
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount OCR uploads for serving cropped images (must be before /static for correct routing)
    from pathlib import Path
    ocr_upload_path = Path(settings.ocr_upload_dir).resolve()
    ocr_upload_path.mkdir(parents=True, exist_ok=True)
    app.mount("/static/ocr", StaticFiles(directory=str(ocr_upload_path)), name="ocr_static")

    # Mount static files
    app.mount("/static", StaticFiles(directory="static"), name="static")

    # Include API router
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_application()


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "version": settings.app_version}
