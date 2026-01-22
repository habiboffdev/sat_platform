"""Add extracted_passages table and Phase 6 error handling columns

Revision ID: ocr003_passages_errors
Revises: ocr002_tables_v2
Create Date: 2025-01-20 16:00:00.000000

This migration adds:
1. extracted_passages table for separate passage extraction from EBRW questions
2. extracted_passage_id foreign key in extracted_questions
3. Phase 6 error handling columns for retry and parallel processing
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ocr003_passages_errors'
down_revision: Union[str, None] = 'ocr002_tables_v2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ===== PHASE 1: ExtractedPassage Table =====

    # Create extracted_passages table
    op.execute("""
        CREATE TABLE IF NOT EXISTS extracted_passages (
            id SERIAL PRIMARY KEY,
            job_id INTEGER NOT NULL REFERENCES ocr_jobs(id) ON DELETE CASCADE,
            source_page_id INTEGER REFERENCES ocr_job_pages(id) ON DELETE SET NULL,

            -- Content
            title VARCHAR(255),
            content TEXT NOT NULL,
            source VARCHAR(255),
            author VARCHAR(255),
            word_count INTEGER,
            -- Figures: [{"s3_key": "...", "url": "...", "alt": "...", "caption": "..."}]
            figures JSONB,

            -- Classification
            genre VARCHAR(100),
            topic_tags JSONB,

            -- Review
            review_status questionreviewstatus NOT NULL DEFAULT 'pending',
            extraction_confidence FLOAT NOT NULL DEFAULT 0.0,
            imported_passage_id INTEGER REFERENCES passages(id) ON DELETE SET NULL,

            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_passages_id ON extracted_passages(id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_passages_job_id ON extracted_passages(job_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_passages_source_page_id ON extracted_passages(source_page_id)")

    # Add extracted_passage_id to extracted_questions
    op.execute("""
        ALTER TABLE extracted_questions
        ADD COLUMN IF NOT EXISTS extracted_passage_id INTEGER REFERENCES extracted_passages(id) ON DELETE SET NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_extracted_questions_extracted_passage_id ON extracted_questions(extracted_passage_id)")

    # ===== PHASE 6: Error Handling and Retry Columns =====

    # Add columns to ocr_job_pages for retry tracking
    op.execute("""
        ALTER TABLE ocr_job_pages
        ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE
    """)
    op.execute("""
        ALTER TABLE ocr_job_pages
        ADD COLUMN IF NOT EXISTS provider_used VARCHAR(50)
    """)

    # Add columns to ocr_jobs for processing mode and failed pages tracking
    op.execute("""
        ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS processing_mode VARCHAR(20) DEFAULT 'balanced'
    """)
    op.execute("""
        ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS failed_pages_count INTEGER DEFAULT 0
    """)


def downgrade() -> None:
    # Phase 6 columns
    op.execute("ALTER TABLE ocr_jobs DROP COLUMN IF EXISTS failed_pages_count")
    op.execute("ALTER TABLE ocr_jobs DROP COLUMN IF EXISTS processing_mode")
    op.execute("ALTER TABLE ocr_job_pages DROP COLUMN IF EXISTS provider_used")
    op.execute("ALTER TABLE ocr_job_pages DROP COLUMN IF EXISTS last_error_at")

    # Phase 1 columns and table
    op.execute("DROP INDEX IF EXISTS ix_extracted_questions_extracted_passage_id")
    op.execute("ALTER TABLE extracted_questions DROP COLUMN IF EXISTS extracted_passage_id")
    op.execute("DROP TABLE IF EXISTS extracted_passages")
