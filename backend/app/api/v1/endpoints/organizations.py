"""
Organization endpoints for learning centers, schools, and tutoring companies.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ActiveUser, AdminUser
from app.models import (
    Assignment,
    AssignmentSubmission,
    Class,
    ClassStudent,
    Organization,
    OrganizationMember,
    StudentAssignment,
    TestAttempt,
    User,
)
from app.models.enums import AttemptStatus

router = APIRouter(prefix="/organizations", tags=["Organizations"])


# === Pydantic Schemas ===


class OrganizationCreate(BaseModel):
    name: str = Field(max_length=255)
    slug: str = Field(max_length=255)
    description: str | None = None
    org_type: str = "learning_center"
    email: str | None = None
    phone: str | None = None
    address: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    logo_url: str | None = None
    website: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None


class ClassCreate(BaseModel):
    name: str = Field(max_length=255)
    description: str | None = None
    schedule: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None


class AssignmentCreate(BaseModel):
    title: str = Field(max_length=255)
    description: str | None = None
    class_id: int | None = None
    student_ids: list[int] | None = None  # For individual assignments
    assignment_type: str  # test, content, practice
    test_id: int | None = None
    content_ids: list[int] | None = None
    due_date: datetime | None = None
    max_attempts: int | None = None


# === Organization Endpoints ===


@router.get("")
async def list_my_organizations(
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List organizations the current user belongs to."""
    result = await db.execute(
        select(OrganizationMember, Organization)
        .join(Organization, Organization.id == OrganizationMember.organization_id)
        .where(
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    memberships = result.all()

    return {
        "organizations": [
            {
                "id": org.id,
                "name": org.name,
                "slug": org.slug,
                "org_type": org.org_type,
                "logo_url": org.logo_url,
                "my_role": membership.role,
            }
            for membership, org in memberships
        ]
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a new organization (user becomes owner)."""
    # Check slug uniqueness
    result = await db.execute(
        select(Organization).where(Organization.slug == data.slug)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization with this slug already exists",
        )

    org = Organization(**data.model_dump())
    db.add(org)
    await db.flush()

    # Add creator as owner
    membership = OrganizationMember(
        organization_id=org.id,
        user_id=current_user.id,
        role="owner",
    )
    db.add(membership)

    return {"id": org.id, "slug": org.slug, "message": "Organization created"}


@router.get("/{org_id}")
async def get_organization(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get organization details."""
    # Verify membership
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == current_user.id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    membership = result.scalar_one_or_none()

    if not membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    result = await db.execute(
        select(Organization).where(Organization.id == org_id)
    )
    org = result.scalar_one()

    # Get counts
    member_count = await db.execute(
        select(func.count()).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    class_count = await db.execute(
        select(func.count()).where(
            Class.organization_id == org_id,
            Class.is_active == True,  # noqa: E712
        )
    )

    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "description": org.description,
        "org_type": org.org_type,
        "logo_url": org.logo_url,
        "website": org.website,
        "email": org.email,
        "phone": org.phone,
        "address": org.address,
        "my_role": membership.role,
        "member_count": member_count.scalar() or 0,
        "class_count": class_count.scalar() or 0,
    }


@router.get("/{org_id}/members")
async def list_organization_members(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    role: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List organization members."""
    # Verify membership with admin/owner role
    await _verify_org_admin(db, org_id, current_user.id)

    query = (
        select(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )

    if role:
        query = query.where(OrganizationMember.role == role)

    # Count
    count_query = select(func.count()).where(
        OrganizationMember.organization_id == org_id,
        OrganizationMember.is_active == True,  # noqa: E712
    )
    if role:
        count_query = count_query.where(OrganizationMember.role == role)
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    members = result.all()

    return {
        "members": [
            {
                "id": m.id,
                "user_id": u.id,
                "email": u.email,
                "full_name": u.full_name,
                "role": m.role,
                "grade_level": m.grade_level,
                "target_score": m.target_score,
                "test_date": m.test_date.isoformat() if m.test_date else None,
                "joined_at": m.created_at.isoformat(),
            }
            for m, u in members
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{org_id}/members")
async def add_organization_member(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: int = None,
    email: str = None,
    role: str = "student",
):
    """Add a member to the organization."""
    await _verify_org_admin(db, org_id, current_user.id)

    # Find user by ID or email
    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
    elif email:
        result = await db.execute(select(User).where(User.email == email))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either user_id or email is required",
        )

    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Check if already a member
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user.id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already a member",
            )
        # Reactivate
        existing.is_active = True
        existing.role = role
        return {"message": "Member reactivated"}

    membership = OrganizationMember(
        organization_id=org_id,
        user_id=user.id,
        role=role,
    )
    db.add(membership)

    return {"message": "Member added", "user_id": user.id}


# === Class Endpoints ===


@router.get("/{org_id}/classes")
async def list_classes(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List classes in an organization."""
    membership = await _verify_org_membership(db, org_id, current_user.id)

    query = select(Class).where(
        Class.organization_id == org_id,
        Class.is_active == True,  # noqa: E712
    )

    # Students only see their classes
    if membership.role == "student":
        query = query.join(ClassStudent).where(
            ClassStudent.student_id == current_user.id,
            ClassStudent.is_active == True,  # noqa: E712
        )

    result = await db.execute(query.order_by(Class.created_at.desc()))
    classes = result.scalars().all()

    return {
        "classes": [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "schedule": c.schedule,
                "teacher_id": c.teacher_id,
            }
            for c in classes
        ]
    }


@router.post("/{org_id}/classes", status_code=status.HTTP_201_CREATED)
async def create_class(
    org_id: int,
    data: ClassCreate,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create a class in the organization."""
    membership = await _verify_org_admin(db, org_id, current_user.id)

    class_ = Class(
        organization_id=org_id,
        teacher_id=current_user.id,
        **data.model_dump(),
    )
    db.add(class_)
    await db.flush()

    return {"id": class_.id, "message": "Class created"}


@router.get("/{org_id}/classes/{class_id}/students")
async def list_class_students(
    org_id: int,
    class_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List students in a class with their stats."""
    await _verify_org_admin(db, org_id, current_user.id)

    result = await db.execute(
        select(ClassStudent, User)
        .join(User, User.id == ClassStudent.student_id)
        .where(
            ClassStudent.class_id == class_id,
            ClassStudent.is_active == True,  # noqa: E712
        )
    )
    students = result.all()

    # Get stats for each student
    student_stats = []
    for cs, user in students:
        # Get latest test score
        score_result = await db.execute(
            select(TestAttempt.total_score)
            .where(
                TestAttempt.user_id == user.id,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
            .order_by(TestAttempt.completed_at.desc())
            .limit(1)
        )
        latest_score = score_result.scalar()

        # Get test count
        test_count = await db.execute(
            select(func.count())
            .where(
                TestAttempt.user_id == user.id,
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
        )

        student_stats.append({
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "enrolled_at": cs.enrolled_at.isoformat(),
            "latest_score": latest_score,
            "tests_completed": test_count.scalar() or 0,
        })

    return {"students": student_stats}


@router.post("/{org_id}/classes/{class_id}/students")
async def add_student_to_class(
    org_id: int,
    class_id: int,
    student_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Add a student to a class."""
    await _verify_org_admin(db, org_id, current_user.id)

    # Verify student is org member
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == student_id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not a member of this organization",
        )

    # Check if already in class
    result = await db.execute(
        select(ClassStudent).where(
            ClassStudent.class_id == class_id,
            ClassStudent.student_id == student_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        if existing.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already in this class",
            )
        existing.is_active = True
        return {"message": "Student re-added to class"}

    enrollment = ClassStudent(
        class_id=class_id,
        student_id=student_id,
        enrolled_at=datetime.now(UTC),
    )
    db.add(enrollment)

    return {"message": "Student added to class"}


# === Assignment Endpoints ===


@router.get("/{org_id}/assignments")
async def list_assignments(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    class_id: int | None = None,
):
    """List assignments."""
    membership = await _verify_org_membership(db, org_id, current_user.id)

    query = select(Assignment).where(
        Assignment.organization_id == org_id,
        Assignment.is_published == True,  # noqa: E712
    )

    if class_id:
        query = query.where(Assignment.class_id == class_id)

    # Students see only their assignments
    if membership.role == "student":
        # Assignments for their classes or directly assigned
        query = query.where(
            (Assignment.class_id.in_(
                select(ClassStudent.class_id).where(
                    ClassStudent.student_id == current_user.id,
                    ClassStudent.is_active == True,  # noqa: E712
                )
            )) |
            (Assignment.id.in_(
                select(StudentAssignment.assignment_id).where(
                    StudentAssignment.student_id == current_user.id
                )
            ))
        )

    result = await db.execute(query.order_by(Assignment.due_date))
    assignments = result.scalars().all()

    # Get submission status for each
    assignment_list = []
    for a in assignments:
        submission = await db.execute(
            select(AssignmentSubmission).where(
                AssignmentSubmission.assignment_id == a.id,
                AssignmentSubmission.student_id == current_user.id,
            )
        )
        sub = submission.scalar_one_or_none()

        assignment_list.append({
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "assignment_type": a.assignment_type,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "class_id": a.class_id,
            "submission_status": sub.status if sub else "not_started",
            "grade": sub.grade if sub else None,
        })

    return {"assignments": assignment_list}


@router.post("/{org_id}/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignment(
    org_id: int,
    data: AssignmentCreate,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Create an assignment."""
    await _verify_org_admin(db, org_id, current_user.id)

    assignment = Assignment(
        organization_id=org_id,
        created_by_id=current_user.id,
        title=data.title,
        description=data.description,
        class_id=data.class_id,
        assignment_type=data.assignment_type,
        test_id=data.test_id,
        content_ids=data.content_ids,
        due_date=data.due_date,
        max_attempts=data.max_attempts,
        is_published=True,
    )
    db.add(assignment)
    await db.flush()

    # Add individual student assignments if specified
    if data.student_ids:
        from app.models.organization import StudentAssignment
        for student_id in data.student_ids:
            sa = StudentAssignment(
                assignment_id=assignment.id,
                student_id=student_id,
            )
            db.add(sa)

    return {"id": assignment.id, "message": "Assignment created"}


@router.get("/{org_id}/dashboard")
async def get_org_dashboard(
    org_id: int,
    current_user: ActiveUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get organization dashboard stats."""
    await _verify_org_admin(db, org_id, current_user.id)

    # Member counts by role
    member_counts = await db.execute(
        select(OrganizationMember.role, func.count())
        .where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
        .group_by(OrganizationMember.role)
    )
    role_counts = {role: count for role, count in member_counts}

    # Class count
    class_count = await db.execute(
        select(func.count()).where(
            Class.organization_id == org_id,
            Class.is_active == True,  # noqa: E712
        )
    )

    # Get student IDs
    student_ids_result = await db.execute(
        select(OrganizationMember.user_id).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.role == "student",
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    student_ids = [row[0] for row in student_ids_result]

    # Tests completed by students
    tests_completed = 0
    avg_score = None
    if student_ids:
        stats = await db.execute(
            select(
                func.count(),
                func.avg(TestAttempt.total_score),
            )
            .where(
                TestAttempt.user_id.in_(student_ids),
                TestAttempt.status == AttemptStatus.COMPLETED,
            )
        )
        row = stats.one()
        tests_completed = row[0] or 0
        avg_score = float(row[1]) if row[1] else None

    return {
        "member_counts": role_counts,
        "class_count": class_count.scalar() or 0,
        "student_count": len(student_ids),
        "tests_completed": tests_completed,
        "average_score": avg_score,
    }


# === Helper Functions ===


async def _verify_org_membership(
    db: AsyncSession,
    org_id: int,
    user_id: int,
) -> OrganizationMember:
    """Verify user is a member of the organization."""
    result = await db.execute(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.is_active == True,  # noqa: E712
        )
    )
    membership = result.scalar_one_or_none()

    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found or not a member",
        )

    return membership


async def _verify_org_admin(
    db: AsyncSession,
    org_id: int,
    user_id: int,
) -> OrganizationMember:
    """Verify user has admin rights in the organization."""
    membership = await _verify_org_membership(db, org_id, user_id)

    if membership.role not in ("owner", "admin", "teacher"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions",
        )

    return membership
