# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SAT prep platform with separate backend and frontend deployments. FastAPI backend, React frontend (planned), PostgreSQL database. Supports individual students and learning centers/schools.

## Development Commands

### Backend

```bash
cd backend

# Install dependencies
pip install -e ".[dev]"

# Run development server
uvicorn app.main:app --reload --port 8000

# Run with Docker
docker-compose up -d

# Database migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1

# Linting and type checking
ruff check .
ruff format .
mypy app/

# Run tests
pytest
pytest --cov=app
pytest tests/test_auth.py -v  # Run specific test file
pytest -k "test_login"        # Run tests matching pattern
```

## Architecture

```
Backend (FastAPI + SQLAlchemy + asyncpg)
    │
PostgreSQL ──────────────────────────────
    │
    ├── users, subscriptions, refresh_tokens
    ├── tests, test_modules, questions, passages
    ├── test_attempts, attempt_answers, module_results
    ├── content, content_categories, content_progress
    ├── organizations, classes, assignments
    └── analytics, leaderboards, notifications, study_plans
```

## Backend Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI application entry
│   ├── api/v1/
│   │   ├── router.py        # API router aggregation
│   │   └── endpoints/
│   │       ├── auth.py      # Login, register, refresh, logout
│   │       ├── users.py     # User CRUD, profile
│   │       ├── tests.py     # Test/module/question CRUD
│   │       ├── attempts.py  # Test-taking flow with adaptive logic
│   │       ├── content.py   # Educational content
│   │       ├── analytics.py # Student analytics, leaderboard, study plans
│   │       └── organizations.py  # Learning centers, classes, assignments
│   ├── core/
│   │   ├── config.py        # Settings from environment
│   │   ├── database.py      # Async SQLAlchemy setup
│   │   ├── security.py      # JWT, password hashing
│   │   ├── deps.py          # FastAPI dependencies
│   │   └── exceptions.py    # Custom exceptions
│   ├── models/
│   │   ├── enums.py         # All enums
│   │   ├── user.py          # User, Subscription, RefreshToken
│   │   ├── test.py          # Test, TestModule, Question, Passage, Attempts
│   │   ├── content.py       # Content, ContentCategory, ContentProgress
│   │   ├── organization.py  # Organization, Class, Assignment
│   │   └── analytics.py     # StudentAnalytics, Leaderboard, StudyPlan
│   ├── schemas/             # Pydantic request/response schemas
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── scoring_service.py
│   │   ├── analytics_service.py
│   │   └── storage_service.py
│   └── middleware/
├── migrations/              # Alembic migrations
├── tests/                   # pytest tests
│   ├── conftest.py          # Fixtures
│   ├── test_auth.py
│   ├── test_tests.py
│   ├── test_attempts.py
│   ├── test_content.py
│   ├── test_analytics.py
│   ├── test_organizations.py
│   └── test_scoring.py
└── pyproject.toml
```

## SAT Test Structure

The digital SAT has a specific structure:

- **Sections**: `READING_WRITING` and `MATH`
- **Modules**: Each section has 2 modules (`MODULE_1`, `MODULE_2`)
- **Adaptive Testing**: Module 2 difficulty (`EASIER`, `STANDARD`, `HARDER`) depends on Module 1 performance
  - ≥70% correct → HARDER module
  - ≤40% correct → EASIER module
  - Otherwise → STANDARD module
- **Question Types**:
  - `MULTIPLE_CHOICE`: 4 options (A, B, C, D)
  - `STUDENT_PRODUCED_RESPONSE`: Grid-in for math
- **Content Domains**:
  - RW: Craft & Structure, Information & Ideas, Standard English Conventions, Expression of Ideas
  - Math: Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry & Trigonometry

## Key Features

### For Students
- Take full SAT practice tests with adaptive module selection
- Track score progression and domain performance
- Personalized study plans and recommendations
- Progress through educational content (videos, articles, lessons)
- Leaderboards and achievements (gamification)

### For Learning Centers
- Multi-tenant organization support (schools, tutoring companies)
- Create classes and manage students
- Assign tests and content with due dates
- View student analytics and performance
- Teacher dashboard with class statistics

### For Admins
- Platform-wide analytics
- Score distribution across all users
- User and content management
- Test and question bank management

## API Endpoints (v1)

**Auth** (`/api/v1/auth`):
- `POST /register`, `POST /login`, `POST /refresh`, `POST /logout`
- `GET /me`, `POST /change-password`, `POST /logout-all`

**Tests** (`/api/v1/tests`):
- Student: `GET /`, `GET /{id}`
- Admin: `GET /admin/all`, `POST /`, `PATCH /{id}`, `DELETE /{id}`
- Modules: `POST /{id}/modules`, `PATCH /modules/{id}`
- Questions: `POST /modules/{id}/questions`, `PATCH /questions/{id}`

**Attempts** (`/api/v1/attempts`):
- `POST /` (start), `GET /`, `GET /{id}`
- `GET /{id}/current-module`, `POST /{id}/submit-module`, `POST /{id}/abandon`

**Content** (`/api/v1/content`):
- `GET /`, `GET /categories`, `GET /{id}`, `POST /{id}/progress`
- Admin: `POST /`, `PATCH /{id}`, `DELETE /{id}`

**Analytics** (`/api/v1/analytics`):
- Student: `GET /me`, `GET /me/score-history`, `GET /me/domain-performance`
- `GET /leaderboard`, `GET /notifications`, `POST /notifications/{id}/read`
- `GET /study-plans`, `GET /study-plans/{id}`, `POST /study-plans/{id}/tasks/{id}/complete`
- Admin: `GET /platform`, `GET /platform/score-distribution`, `GET /students/{id}`

**Organizations** (`/api/v1/organizations`):
- `GET /`, `POST /`, `GET /{id}`, `GET /{id}/dashboard`
- Members: `GET /{id}/members`, `POST /{id}/members`
- Classes: `GET /{id}/classes`, `POST /{id}/classes`, `POST /{id}/classes/{id}/students`
- Assignments: `GET /{id}/assignments`, `POST /{id}/assignments`

## Question Format

Questions support images in question text and options:
```python
{
    "question_text": "What is shown in the figure?",
    "question_image_url": "https://...",
    "options": [
        {"id": "A", "text": "Option A", "image_url": null},
        {"id": "B", "text": "", "image_url": "https://..."},  # Image-only option
    ],
    "correct_answer": ["A"],  # List for grid-in with multiple formats
    "skill_tags": ["reading-comprehension", "graphs"],
    "domain": "information_and_ideas",
}
```

## Authentication Flow

1. JWT access token (15 min) in Authorization header
2. Refresh token (7 days) in httpOnly cookie
3. Token rotation on refresh (old token revoked)
4. Dependencies: `CurrentUser`, `ActiveUser`, `AdminUser`, `TeacherOrAdmin`

## Testing

Tests use SQLite in-memory database. Fixtures in `tests/conftest.py` provide:
- `test_user`, `test_teacher`, `test_admin` - User fixtures
- `user_token`, `teacher_token`, `admin_token` - JWT tokens
- `test_full_sat` - Complete SAT test with all modules and questions
- `test_content`, `test_content_category` - Educational content
