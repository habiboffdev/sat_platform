"""Add pdf_data column for storing PDF binary in database

Revision ID: ocr005_pdf_data
Revises: ocr004_page_image_data
Create Date: 2025-01-23 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ocr005_pdf_data'
down_revision: Union[str, None] = 'ocr004_page_image_data'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add pdf_data column to store PDF binary for cross-dyno access
    op.execute("""
        ALTER TABLE ocr_jobs
        ADD COLUMN IF NOT EXISTS pdf_data BYTEA
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE ocr_jobs
        DROP COLUMN IF EXISTS pdf_data
    """)
