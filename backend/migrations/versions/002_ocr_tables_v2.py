"""Add table_data to questions and test_configs to ocr_jobs

Revision ID: 002_ocr_tables_v2
Revises: 001_add_ocr_tables
Create Date: 2025-01-20 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '002_ocr_tables_v2'
down_revision: Union[str, None] = '001_add_ocr_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add table_data JSONB column to extracted_questions
    # This stores structured table data: {"headers": [...], "rows": [[...]], "title": "..."}
    op.execute("""
        ALTER TABLE extracted_questions
        ADD COLUMN IF NOT EXISTS table_data JSONB
    """)

    # Add test_configs JSONB column to ocr_jobs
    # This stores test configuration for import:
    # [{"test_title": "...", "test_type": "full_test", "modules": [...]}]
    op.execute("""
        ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS test_configs JSONB
    """)

    # Add created_test_ids JSONB column to ocr_jobs
    # Array of test IDs created from this job
    op.execute("""
        ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS created_test_ids JSONB
    """)

    # Add table_data JSONB column to questions (production table)
    # For imported questions that have tables
    op.execute("""
        ALTER TABLE questions
        ADD COLUMN IF NOT EXISTS table_data JSONB
    """)

    # Add passage_id to questions for linking to passages table if it exists
    # Check if passages table exists first
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'passages') THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'questions' AND column_name = 'passage_id'
                ) THEN
                    ALTER TABLE questions ADD COLUMN passage_id INTEGER REFERENCES passages(id) ON DELETE SET NULL;
                    CREATE INDEX IF NOT EXISTS ix_questions_passage_id ON questions(passage_id);
                END IF;
            END IF;
        END$$
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE extracted_questions DROP COLUMN IF EXISTS table_data")
    op.execute("ALTER TABLE ocr_jobs DROP COLUMN IF EXISTS test_configs")
    op.execute("ALTER TABLE ocr_jobs DROP COLUMN IF EXISTS created_test_ids")
    op.execute("ALTER TABLE questions DROP COLUMN IF EXISTS table_data")
    op.execute("DROP INDEX IF EXISTS ix_questions_passage_id")
    op.execute("ALTER TABLE questions DROP COLUMN IF EXISTS passage_id")
