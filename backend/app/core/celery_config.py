"""Celery configuration for background task processing."""

from celery import Celery

from app.core.config import settings

# Create Celery app
celery_app = Celery(
    "sat_platform",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "app.tasks.ocr_tasks",
    ],
)

# Celery configuration
celery_app.conf.update(
    # Task settings
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,

    # Result backend settings
    result_expires=86400,  # Results expire after 24 hours

    # Worker settings
    worker_prefetch_multiplier=1,  # Only prefetch one task at a time (important for long tasks)
    worker_concurrency=4,  # Number of concurrent workers

    # Task routing
    task_routes={
        "app.tasks.ocr_tasks.process_pdf_job": {"queue": "ocr"},
        "app.tasks.ocr_tasks.process_page_batch": {"queue": "ocr"},
        "app.tasks.ocr_tasks.structure_questions": {"queue": "ocr"},
        "app.tasks.ocr_tasks.structure_skipped_pages": {"queue": "ocr"},
        "app.tasks.ocr_tasks.retry_failed_pages": {"queue": "ocr"},
        "app.tasks.ocr_tasks.cancel_ocr_job": {"queue": "ocr"},
    },

    # Task time limits
    task_soft_time_limit=1800,  # 30 minute soft limit
    task_time_limit=2100,  # 35 minute hard limit

    # Retry settings
    task_acks_late=True,  # Acknowledge tasks after completion (for retry on worker crash)
    task_reject_on_worker_lost=True,  # Reject tasks if worker dies

    # Beat scheduler (for periodic tasks if needed)
    beat_schedule={},
)

# Optional: Configure task queues
celery_app.conf.task_queues = {
    "default": {
        "exchange": "default",
        "routing_key": "default",
    },
    "ocr": {
        "exchange": "ocr",
        "routing_key": "ocr",
    },
}
