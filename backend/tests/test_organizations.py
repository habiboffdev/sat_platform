"""
Tests for organizations, classes, and assignments.
"""

import pytest
from httpx import AsyncClient

from app.models import Organization, OrganizationMember, Class
from tests.conftest import auth_headers


class TestOrganizationCreation:
    """Tests for creating organizations."""

    @pytest.mark.asyncio
    async def test_create_organization(
        self, client: AsyncClient, test_user, user_token
    ):
        """Test creating a new organization."""
        response = await client.post(
            "/api/v1/organizations",
            headers=auth_headers(user_token),
            json={
                "name": "Test Learning Center",
                "slug": "test-learning-center",
                "description": "A test learning center",
                "org_type": "learning_center",
                "email": "contact@testcenter.com",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["slug"] == "test-learning-center"
        assert "id" in data

    @pytest.mark.asyncio
    async def test_create_organization_duplicate_slug(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test that duplicate slugs are rejected."""
        # Create first org
        org = Organization(
            name="Existing Center",
            slug="existing-center",
        )
        db_session.add(org)
        await db_session.commit()

        # Try to create with same slug
        response = await client.post(
            "/api/v1/organizations",
            headers=auth_headers(user_token),
            json={
                "name": "Another Center",
                "slug": "existing-center",  # Duplicate
            },
        )

        assert response.status_code == 400


class TestOrganizationMembership:
    """Tests for organization membership."""

    @pytest.mark.asyncio
    async def test_list_my_organizations(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test listing organizations I belong to."""
        # Create org and add user as member
        org = Organization(name="My Center", slug="my-center")
        db_session.add(org)
        await db_session.flush()

        membership = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="student",
        )
        db_session.add(membership)
        await db_session.commit()

        response = await client.get(
            "/api/v1/organizations",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["organizations"]) >= 1
        assert any(o["slug"] == "my-center" for o in data["organizations"])

    @pytest.mark.asyncio
    async def test_get_organization_detail(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test getting organization details."""
        # Create org and add user
        org = Organization(name="Detail Center", slug="detail-center")
        db_session.add(org)
        await db_session.flush()

        membership = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(membership)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Detail Center"
        assert data["my_role"] == "owner"

    @pytest.mark.asyncio
    async def test_get_organization_not_member(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test that non-members cannot view organization."""
        org = Organization(name="Private Center", slug="private-center")
        db_session.add(org)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 404


class TestOrganizationMembers:
    """Tests for managing organization members."""

    @pytest.mark.asyncio
    async def test_list_members(
        self, client: AsyncClient, test_user, test_teacher, user_token, db_session
    ):
        """Test listing organization members."""
        # Create org with user as owner
        org = Organization(name="Members Center", slug="members-center")
        db_session.add(org)
        await db_session.flush()

        # Add owner
        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)

        # Add teacher as member
        teacher_member = OrganizationMember(
            organization_id=org.id,
            user_id=test_teacher.id,
            role="teacher",
        )
        db_session.add(teacher_member)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}/members",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2

    @pytest.mark.asyncio
    async def test_add_member(
        self, client: AsyncClient, test_user, test_teacher, user_token, db_session
    ):
        """Test adding a member to organization."""
        # Create org with user as owner
        org = Organization(name="Add Member Center", slug="add-member-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)
        await db_session.commit()

        # Add teacher
        response = await client.post(
            f"/api/v1/organizations/{org.id}/members",
            headers=auth_headers(user_token),
            params={"user_id": test_teacher.id, "role": "teacher"},
        )

        assert response.status_code == 200


class TestClasses:
    """Tests for class management."""

    @pytest.mark.asyncio
    async def test_create_class(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test creating a class."""
        # Create org with user as owner
        org = Organization(name="Class Center", slug="class-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)
        await db_session.commit()

        response = await client.post(
            f"/api/v1/organizations/{org.id}/classes",
            headers=auth_headers(user_token),
            json={
                "name": "SAT Prep Fall 2024",
                "description": "Intensive SAT preparation",
                "schedule": "Mon/Wed 4-6pm",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    @pytest.mark.asyncio
    async def test_list_classes(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test listing classes in organization."""
        # Create org with class
        org = Organization(name="List Class Center", slug="list-class-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)

        class_ = Class(
            organization_id=org.id,
            name="Test Class",
            teacher_id=test_user.id,
        )
        db_session.add(class_)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}/classes",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["classes"]) >= 1

    @pytest.mark.asyncio
    async def test_add_student_to_class(
        self, client: AsyncClient, test_user, test_teacher, user_token, db_session
    ):
        """Test adding a student to a class."""
        # Setup org, class, and members
        org = Organization(name="Student Class Center", slug="student-class-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        student = OrganizationMember(
            organization_id=org.id,
            user_id=test_teacher.id,  # Using teacher as student for test
            role="student",
        )
        db_session.add(owner)
        db_session.add(student)

        class_ = Class(
            organization_id=org.id,
            name="Test Class",
            teacher_id=test_user.id,
        )
        db_session.add(class_)
        await db_session.commit()

        # Add student to class
        response = await client.post(
            f"/api/v1/organizations/{org.id}/classes/{class_.id}/students",
            headers=auth_headers(user_token),
            params={"student_id": test_teacher.id},
        )

        assert response.status_code == 200


class TestAssignments:
    """Tests for assignment management."""

    @pytest.mark.asyncio
    async def test_create_assignment(
        self, client: AsyncClient, test_user, user_token, test_full_sat, db_session
    ):
        """Test creating an assignment."""
        # Setup org and class
        org = Organization(name="Assignment Center", slug="assignment-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)

        class_ = Class(
            organization_id=org.id,
            name="Test Class",
            teacher_id=test_user.id,
        )
        db_session.add(class_)
        await db_session.commit()

        response = await client.post(
            f"/api/v1/organizations/{org.id}/assignments",
            headers=auth_headers(user_token),
            json={
                "title": "Practice Test Assignment",
                "description": "Complete this practice test by Friday",
                "class_id": class_.id,
                "assignment_type": "test",
                "test_id": test_full_sat.id,
                "max_attempts": 2,
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "id" in data

    @pytest.mark.asyncio
    async def test_list_assignments(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test listing assignments."""
        from app.models import Assignment, ClassStudent
        from datetime import datetime, timedelta, UTC

        # Setup org, class, and assignment
        org = Organization(name="List Assignment Center", slug="list-assignment-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="student",  # As student to test visibility
        )
        db_session.add(owner)

        class_ = Class(
            organization_id=org.id,
            name="Test Class",
        )
        db_session.add(class_)
        await db_session.flush()

        # Enroll student in class
        enrollment = ClassStudent(
            class_id=class_.id,
            student_id=test_user.id,
        )
        db_session.add(enrollment)

        # Create assignment
        assignment = Assignment(
            organization_id=org.id,
            class_id=class_.id,
            title="Test Assignment",
            assignment_type="test",
            is_published=True,
            due_date=datetime.now(UTC) + timedelta(days=7),
        )
        db_session.add(assignment)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}/assignments",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["assignments"]) >= 1


class TestOrganizationDashboard:
    """Tests for organization dashboard."""

    @pytest.mark.asyncio
    async def test_get_org_dashboard(
        self, client: AsyncClient, test_user, user_token, db_session
    ):
        """Test getting organization dashboard."""
        # Setup org
        org = Organization(name="Dashboard Center", slug="dashboard-center")
        db_session.add(org)
        await db_session.flush()

        owner = OrganizationMember(
            organization_id=org.id,
            user_id=test_user.id,
            role="owner",
        )
        db_session.add(owner)
        await db_session.commit()

        response = await client.get(
            f"/api/v1/organizations/{org.id}/dashboard",
            headers=auth_headers(user_token),
        )

        assert response.status_code == 200
        data = response.json()
        assert "member_counts" in data
        assert "class_count" in data
        assert "student_count" in data
