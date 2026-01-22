"""Renumber questions to fix gaps

Revision ID: 54ed715bf2c7
Revises: 50812368915c
Create Date: 2026-01-07 18:41:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54ed715bf2c7'
down_revision: Union[str, None] = '50812368915c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Renumber all questions in each module to be sequential (1, 2, 3, ...)."""
    # Get database connection
    connection = op.get_bind()

    # Get all unique module IDs
    modules = connection.execute(
        sa.text("SELECT DISTINCT module_id FROM questions ORDER BY module_id")
    ).fetchall()

    for (module_id,) in modules:
        # Get all questions in this module ordered by their current question_number
        questions = connection.execute(
            sa.text("""
                SELECT id FROM questions
                WHERE module_id = :module_id
                ORDER BY question_number
            """),
            {"module_id": module_id}
        ).fetchall()

        # Update each question to have sequential numbering
        for new_number, (question_id,) in enumerate(questions, start=1):
            connection.execute(
                sa.text("""
                    UPDATE questions
                    SET question_number = :new_number
                    WHERE id = :question_id
                """),
                {"new_number": new_number, "question_id": question_id}
            )


def downgrade() -> None:
    """Cannot reliably restore original question numbers - this is a one-way migration."""
    pass
