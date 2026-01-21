from fastapi import APIRouter

from app.api.v1.endpoints import (
    analytics,
    auth,
    attempts,
    content,
    drills,
    ocr,
    organizations,
    passages,
    questions,
    tests,
    users,
    uploads,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(tests.router)
api_router.include_router(passages.router)
api_router.include_router(attempts.router)
api_router.include_router(content.router)
api_router.include_router(analytics.router)
api_router.include_router(organizations.router)
api_router.include_router(questions.router)
api_router.include_router(drills.router)
api_router.include_router(uploads.router)
api_router.include_router(ocr.router)

