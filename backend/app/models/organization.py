"""
Organization/Learning Center models for multi-tenant support.
Supports learning centers, schools, tutoring companies with their own students and teachers.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.enums import UserRole


class OrganizationType(str, Enum):
    LEARNING_CENTER = "learning_center"
    SCHOOL = "school"
    TUTORING = "tutoring"
    INDIVIDUAL = "individual"


class Organization(Base, TimestampMixin):
    """
    Represents a learning center, school, or tutoring organization.
    Organizations can have their own students, teachers, and custom content.
    """

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    website: Mapped[str | None] = mapped_column(String(500))

    # Organization type
    org_type: Mapped[str] = mapped_column(String(50), default="learning_center")

    # Contact info
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)

    # Settings
    settings: Mapped[dict | None] = mapped_column(JSON)  # Custom settings

    # Limits based on subscription
    max_students: Mapped[int | None] = mapped_column(Integer)
    max_teachers: Mapped[int | None] = mapped_column(Integer)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember", back_populates="organization", cascade="all, delete-orphan"
    )
    classes: Mapped[list["Class"]] = relationship(
        "Class", back_populates="organization", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship(
        "Assignment", back_populates="organization"
    )


class OrganizationMember(Base, TimestampMixin):
    """Links users to organizations with roles."""

    __tablename__ = "organization_members"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Role within organization
    role: Mapped[str] = mapped_column(String(50), default="student")  # owner, admin, teacher, student

    # For students: optional parent/guardian info
    parent_name: Mapped[str | None] = mapped_column(String(255))
    parent_email: Mapped[str | None] = mapped_column(String(255))
    parent_phone: Mapped[str | None] = mapped_column(String(50))

    # Student metadata
    grade_level: Mapped[int | None] = mapped_column(Integer)  # 9, 10, 11, 12
    target_score: Mapped[int | None] = mapped_column(Integer)  # Target SAT score
    test_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # Planned test date

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="organization_memberships")

    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_org_user"),
    )


class Class(Base, TimestampMixin):
    """
    Represents a class/group within an organization.
    Teachers can manage classes of students.
    """

    __tablename__ = "classes"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Teacher who owns this class
    teacher_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Schedule info
    schedule: Mapped[str | None] = mapped_column(String(255))  # e.g., "Mon/Wed 4-6pm"
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="classes")
    teacher: Mapped["User"] = relationship("User", foreign_keys=[teacher_id])
    students: Mapped[list["ClassStudent"]] = relationship(
        "ClassStudent", back_populates="class_", cascade="all, delete-orphan"
    )
    assignments: Mapped[list["Assignment"]] = relationship("Assignment", back_populates="class_")


class ClassStudent(Base, TimestampMixin):
    """Links students to classes."""

    __tablename__ = "class_students"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    class_: Mapped["Class"] = relationship("Class", back_populates="students")
    student: Mapped["User"] = relationship("User")

    __table_args__ = (UniqueConstraint("class_id", "student_id", name="uq_class_student"),)


class Assignment(Base, TimestampMixin):
    """
    Assignments created by teachers for students/classes.
    Can be tests, content to review, or practice sets.
    """

    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Created by teacher
    created_by_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Assignment can be for a class or individual students
    class_id: Mapped[int | None] = mapped_column(
        ForeignKey("classes.id", ondelete="CASCADE"), index=True
    )

    # Assignment type and target
    assignment_type: Mapped[str] = mapped_column(String(50))  # test, content, practice
    test_id: Mapped[int | None] = mapped_column(
        ForeignKey("tests.id", ondelete="SET NULL"), index=True
    )
    content_ids: Mapped[list[int] | None] = mapped_column(JSON)  # List of content IDs

    # Deadline
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Settings
    allow_late_submission: Mapped[bool] = mapped_column(Boolean, default=True)
    max_attempts: Mapped[int | None] = mapped_column(Integer)  # None = unlimited

    is_published: Mapped[bool] = mapped_column(Boolean, default=False)

    # Relationships
    organization: Mapped["Organization"] = relationship("Organization", back_populates="assignments")
    class_: Mapped["Class | None"] = relationship("Class", back_populates="assignments")
    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        "AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan"
    )
    individual_assignments: Mapped[list["StudentAssignment"]] = relationship(
        "StudentAssignment", back_populates="assignment", cascade="all, delete-orphan"
    )


class StudentAssignment(Base, TimestampMixin):
    """For assigning to individual students (not whole class)."""

    __tablename__ = "student_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Relationships
    assignment: Mapped["Assignment"] = relationship(
        "Assignment", back_populates="individual_assignments"
    )
    student: Mapped["User"] = relationship("User")

    __table_args__ = (UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"),)


class AssignmentSubmission(Base, TimestampMixin):
    """Tracks student submissions for assignments."""

    __tablename__ = "assignment_submissions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    assignment_id: Mapped[int] = mapped_column(
        ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Link to test attempt if assignment is a test
    test_attempt_id: Mapped[int | None] = mapped_column(
        ForeignKey("test_attempts.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending, submitted, graded
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Teacher feedback
    grade: Mapped[float | None] = mapped_column()
    feedback: Mapped[str | None] = mapped_column(Text)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    graded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    # Relationships
    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="submissions")
    student: Mapped["User"] = relationship("User", foreign_keys=[student_id])
    graded_by: Mapped["User | None"] = relationship("User", foreign_keys=[graded_by_id])

    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", "test_attempt_id", name="uq_submission"),
    )


# Import at end to avoid circular imports
from app.models.user import User  # noqa: E402
