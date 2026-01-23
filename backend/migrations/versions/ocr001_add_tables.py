"""Add OCR processing tables

Revision ID: ocr001_add_tables
Revises: 54ed715bf2c7
Create Date: 2025-01-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ocr001_add_tables'
down_revision: Union[str, None] = '54ed715bf2c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create OCR enums (only if they don't exist)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ocrjobstatus') THEN
                CREATE TYPE ocrjobstatus AS ENUM (
                    'pending', 'uploading', 'processing', 'structuring',
                    'review', 'importing', 'completed', 'failed', 'cancelled'
                );
            END IF;
        END$$
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ocrprovider') THEN
                CREATE TYPE ocrprovider AS ENUM (
                    'deepinfra', 'openai', 'hybrid', 'replicate', 'openrouter'
                );
            END IF;
        END$$
    """)

    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'questionreviewstatus') THEN
                CREATE TYPE questionreviewstatus AS ENUM (
                    'pending', 'approved', 'rejected', 'needs_edit', 'imported'
                );
            END IF;
        END$$
    """)

    # Create ocr_jobs table
    op.execute("""
        CREATE TABLE IF NOT EXISTS ocr_jobs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_module_id INTEGER REFERENCES test_modules(id) ON DELETE SET NULL,
            status ocrjobstatus NOT NULL DEFAULT 'pending',
            pdf_filename VARCHAR(255) NOT NULL,
            pdf_s3_key VARCHAR(500) NOT NULL,
            pdf_hash VARCHAR(64),
            total_pages INTEGER NOT NULL,
            processed_pages INTEGER NOT NULL DEFAULT 0,
            question_pages INTEGER NOT NULL DEFAULT 0,
            skipped_pages INTEGER NOT NULL DEFAULT 0,
            extracted_questions INTEGER NOT NULL DEFAULT 0,
            approved_questions INTEGER NOT NULL DEFAULT 0,
            imported_questions INTEGER NOT NULL DEFAULT 0,
            ocr_provider ocrprovider DEFAULT 'hybrid',
            estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
            actual_cost_cents INTEGER NOT NULL DEFAULT 0,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            last_error_page INTEGER,
            retry_count INTEGER NOT NULL DEFAULT 0,
            celery_task_id VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_jobs_id ON ocr_jobs(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_jobs_user_id ON ocr_jobs(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_jobs_target_module_id ON ocr_jobs(target_module_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_jobs_pdf_hash ON ocr_jobs(pdf_hash)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_jobs_celery_task_id ON ocr_jobs(celery_task_id)")

    # Create ocr_job_pages table
    op.execute("""
        CREATE TABLE IF NOT EXISTS ocr_job_pages (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
            page_number INTEGER NOT NULL,
            ocr_markdown TEXT,
            is_question_page BOOLEAN NOT NULL DEFAULT FALSE,
            detected_figures JSONB,
            page_image_s3_key VARCHAR(500),
            ocr_completed BOOLEAN NOT NULL DEFAULT FALSE,
            structuring_completed BOOLEAN NOT NULL DEFAULT FALSE,
            ocr_cost_cents INTEGER NOT NULL DEFAULT 0,
            structuring_cost_cents INTEGER NOT NULL DEFAULT 0,
            error_message TEXT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_job_pages_id ON ocr_job_pages(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ocr_job_pages_job_id ON ocr_job_pages(job_id)")

    # Create extracted_questions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS extracted_questions (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
            source_page_id INTEGER NOT NULL REFERENCES ocr_job_pages(id) ON DELETE CASCADE,
            review_status questionreviewstatus NOT NULL DEFAULT 'pending',
            reviewed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            reviewed_at TIMESTAMP WITH TIME ZONE,
            extraction_confidence FLOAT NOT NULL DEFAULT 0.0,
            answer_confidence FLOAT NOT NULL DEFAULT 0.0,
            question_text TEXT NOT NULL,
            question_type questiontype NOT NULL DEFAULT 'MULTIPLE_CHOICE',
            question_image_s3_key VARCHAR(500),
            question_image_url VARCHAR(500),
            passage_text TEXT,
            chart_title VARCHAR(255),
            chart_data TEXT,
            options JSONB,
            correct_answer JSONB,
            needs_answer BOOLEAN NOT NULL DEFAULT FALSE,
            explanation TEXT,
            difficulty questiondifficulty,
            domain questiondomain,
            skill_tags JSONB,
            needs_image BOOLEAN NOT NULL DEFAULT FALSE,
            image_extraction_status VARCHAR(50),
            validation_errors JSONB,
            imported_question_id INTEGER REFERENCES questions(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_questions_id ON extracted_questions(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_questions_job_id ON extracted_questions(job_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_questions_source_page_id ON extracted_questions(source_page_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_questions_imported_question_id ON extracted_questions(imported_question_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS extracted_questions")
    op.execute("DROP TABLE IF EXISTS ocr_job_pages")
    op.execute("DROP TABLE IF EXISTS ocr_jobs")
    op.execute("DROP TYPE IF EXISTS questionreviewstatus")
    op.execute("DROP TYPE IF EXISTS ocrprovider")
    op.execute("DROP TYPE IF EXISTS ocrjobstatus")
