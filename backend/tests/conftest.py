"""
Pytest configuration and fixtures for the SAT Platform tests.
"""

import asyncio
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import (
    Content,
    ContentCategory,
    Passage,
    Question,
    Subscription,
    Test,
    TestModule,
    User,
)
from app.models.enums import (
    ContentType,
    ModuleDifficulty,
    QuestionDifficulty,
    QuestionDomain,
    QuestionType,
    SATModule,
    SATSection,
    SubscriptionPlan,
    SubscriptionStatus,
    TestType,
    UserRole,
)

# Use SQLite for testing (in-memory)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session_maker = async_sessionmaker(
        db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_maker() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create an async HTTP client for testing."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


# === User Fixtures ===


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test student user."""
    user = User(
        email="student@test.com",
        password_hash=hash_password("Test1234!"),
        full_name="Test Student",
        role=UserRole.STUDENT,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.flush()

    subscription = Subscription(
        user_id=user.id,
        plan=SubscriptionPlan.FREE,
        status=SubscriptionStatus.ACTIVE,
    )
    db_session.add(subscription)
    await db_session.commit()

    return user


@pytest_asyncio.fixture
async def test_teacher(db_session: AsyncSession) -> User:
    """Create a test teacher user."""
    user = User(
        email="teacher@test.com",
        password_hash=hash_password("Test1234!"),
        full_name="Test Teacher",
        role=UserRole.TEACHER,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest_asyncio.fixture
async def test_admin(db_session: AsyncSession) -> User:
    """Create a test admin user."""
    user = User(
        email="admin@test.com",
        password_hash=hash_password("Test1234!"),
        full_name="Test Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
def user_token(test_user: User) -> str:
    """Get an access token for the test user."""
    return create_access_token(subject=test_user.id, additional_claims={"role": "student"})


@pytest.fixture
def teacher_token(test_teacher: User) -> str:
    """Get an access token for the test teacher."""
    return create_access_token(subject=test_teacher.id, additional_claims={"role": "teacher"})


@pytest.fixture
def admin_token(test_admin: User) -> str:
    """Get an access token for the test admin."""
    return create_access_token(subject=test_admin.id, additional_claims={"role": "admin"})


def auth_headers(token: str) -> dict[str, str]:
    """Create authorization headers."""
    return {"Authorization": f"Bearer {token}"}


# === Test Data Fixtures ===


@pytest_asyncio.fixture
async def test_passage(db_session: AsyncSession) -> Passage:
    """Create a test passage."""
    passage = Passage(
        title="Sample Reading Passage",
        content="""
        The study of climate change has evolved significantly over the past century.
        Early researchers focused primarily on temperature measurements, while modern
        scientists employ sophisticated computer models to predict future changes.
        This evolution in methodology has led to more accurate predictions about
        global warming and its potential impacts on ecosystems worldwide.
        """,
        source="Science Weekly",
        author="Dr. Jane Smith",
        word_count=60,
        genre="science",
        topic_tags=["climate", "science", "research"],
    )
    db_session.add(passage)
    await db_session.commit()
    return passage


@pytest_asyncio.fixture
async def test_full_sat(db_session: AsyncSession, test_passage: Passage) -> Test:
    """Create a complete SAT test with all modules and questions."""
    # Create test
    test = Test(
        title="SAT Practice Test 1",
        description="Full-length SAT practice test",
        test_type=TestType.FULL_TEST,
        time_limit_minutes=180,
        is_published=True,
        is_premium=False,
    )
    db_session.add(test)
    await db_session.flush()

    # Create modules
    modules_config = [
        # Reading/Writing Section
        (SATSection.READING_WRITING, SATModule.MODULE_1, ModuleDifficulty.STANDARD, 32),
        (SATSection.READING_WRITING, SATModule.MODULE_2, ModuleDifficulty.STANDARD, 32),
        (SATSection.READING_WRITING, SATModule.MODULE_2, ModuleDifficulty.EASIER, 32),
        (SATSection.READING_WRITING, SATModule.MODULE_2, ModuleDifficulty.HARDER, 32),
        # Math Section
        (SATSection.MATH, SATModule.MODULE_1, ModuleDifficulty.STANDARD, 35),
        (SATSection.MATH, SATModule.MODULE_2, ModuleDifficulty.STANDARD, 35),
        (SATSection.MATH, SATModule.MODULE_2, ModuleDifficulty.EASIER, 35),
        (SATSection.MATH, SATModule.MODULE_2, ModuleDifficulty.HARDER, 35),
    ]

    modules = []
    for idx, (section, module, difficulty, time_limit) in enumerate(modules_config):
        m = TestModule(
            test_id=test.id,
            section=section,
            module=module,
            difficulty=difficulty,
            time_limit_minutes=time_limit,
            order_index=idx,
        )
        db_session.add(m)
        modules.append(m)

    await db_session.flush()

    # Add questions to each module
    for module in modules:
        num_questions = 27 if module.section == SATSection.READING_WRITING else 22

        for q_num in range(1, num_questions + 1):
            if module.section == SATSection.READING_WRITING:
                # Reading/Writing question
                question = Question(
                    module_id=module.id,
                    question_number=q_num,
                    question_text=f"Based on the passage, which choice best describes the author's perspective on climate research?",
                    question_type=QuestionType.MULTIPLE_CHOICE,
                    passage_id=test_passage.id if q_num <= 10 else None,
                    options=[
                        {"id": "A", "text": "Skeptical of modern methods", "image_url": None},
                        {"id": "B", "text": "Supportive of technological advances", "image_url": None},
                        {"id": "C", "text": "Neutral about changes", "image_url": None},
                        {"id": "D", "text": "Critical of early researchers", "image_url": None},
                    ],
                    correct_answer=["B"],
                    explanation="The passage indicates positive evolution in methodology.",
                    difficulty=QuestionDifficulty.MEDIUM,
                    domain=QuestionDomain.INFORMATION_AND_IDEAS,
                    skill_tags=["reading-comprehension", "author-perspective"],
                )
            else:
                # Math question
                if q_num <= 18:
                    # Multiple choice math
                    question = Question(
                        module_id=module.id,
                        question_number=q_num,
                        question_text=f"If 2x + 5 = 13, what is the value of x?",
                        question_type=QuestionType.MULTIPLE_CHOICE_MATH,
                        options=[
                            {"id": "A", "text": "3", "image_url": None},
                            {"id": "B", "text": "4", "image_url": None},
                            {"id": "C", "text": "5", "image_url": None},
                            {"id": "D", "text": "6", "image_url": None},
                        ],
                        correct_answer=["B"],
                        explanation="2x + 5 = 13, so 2x = 8, x = 4",
                        difficulty=QuestionDifficulty.EASY,
                        domain=QuestionDomain.ALGEBRA,
                        skill_tags=["linear-equations", "solving-equations"],
                    )
                else:
                    # Grid-in (student-produced response)
                    question = Question(
                        module_id=module.id,
                        question_number=q_num,
                        question_text=f"A rectangle has a length of 12 and a width of 5. What is its area?",
                        question_type=QuestionType.STUDENT_PRODUCED_RESPONSE,
                        correct_answer=["60"],
                        explanation="Area = length × width = 12 × 5 = 60",
                        difficulty=QuestionDifficulty.EASY,
                        domain=QuestionDomain.GEOMETRY_TRIGONOMETRY,
                        skill_tags=["area", "rectangles"],
                        answer_constraints={
                            "min": 0,
                            "max": 9999,
                            "allow_fraction": False,
                            "allow_decimal": False,
                        },
                    )

            db_session.add(question)

    await db_session.commit()
    return test


@pytest_asyncio.fixture
async def test_content_category(db_session: AsyncSession) -> ContentCategory:
    """Create a test content category."""
    category = ContentCategory(
        name="Algebra Fundamentals",
        slug="algebra-fundamentals",
        description="Core algebra concepts for SAT Math",
        section=SATSection.MATH,
        domain=QuestionDomain.ALGEBRA,
    )
    db_session.add(category)
    await db_session.commit()
    return category


@pytest_asyncio.fixture
async def test_content(db_session: AsyncSession, test_content_category: ContentCategory) -> Content:
    """Create test educational content."""
    content = Content(
        title="Solving Linear Equations",
        slug="solving-linear-equations",
        description="Learn the fundamentals of solving linear equations",
        content_type=ContentType.LESSON,
        category_id=test_content_category.id,
        body="""
        # Solving Linear Equations

        A linear equation is an equation where the highest power of the variable is 1.

        ## Steps to Solve:
        1. Simplify both sides
        2. Isolate the variable
        3. Check your answer

        ## Example:
        Solve: 2x + 5 = 13
        - Subtract 5: 2x = 8
        - Divide by 2: x = 4
        """,
        section=SATSection.MATH,
        domain=QuestionDomain.ALGEBRA,
        skill_tags=["linear-equations", "algebra-basics"],
        is_published=True,
        is_premium=False,
        estimated_time_minutes=15,
    )
    db_session.add(content)
    await db_session.commit()
    return content
