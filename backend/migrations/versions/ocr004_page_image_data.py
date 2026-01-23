"""Add page_image_data column for storing rendered page images

Revision ID: ocr004_page_image_data
Revises: ocr003_passages_errors
Create Date: 2025-01-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'ocr004_page_image_data'
down_revision: Union[str, None] = 'ocr003_passages_errors'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add page_image_data column to store rendered JPEG images
    op.execute("""
        ALTER TABLE ocr_job_pages
        ADD COLUMN IF NOT EXISTS page_image_data BYTEA
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE ocr_job_pages
        DROP COLUMN IF EXISTS page_image_data
    """)
