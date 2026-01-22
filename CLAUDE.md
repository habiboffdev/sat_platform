# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SAT prep platform with separate backend and frontend deployments. FastAPI backend, React frontend with Vite, PostgreSQL database. Supports individual students and learning centers/schools.

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

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Architecture

```
Frontend (React + Vite + TypeScript)
    │
    ├── Zustand stores for state
    ├── React Query for API caching
    └── Axios with token refresh interceptor
         │
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
│   │   └── endpoints/       # Route handlers
│   ├── core/
│   │   ├── config.py        # Settings from environment (pydantic-settings)
│   │   ├── database.py      # Async SQLAlchemy setup
│   │   ├── security.py      # JWT, password hashing
│   │   ├── deps.py          # FastAPI dependencies (CurrentUser, AdminUser, etc.)
│   │   └── exceptions.py    # Custom exceptions
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── services/            # Business logic (scoring, analytics)
│   └── middleware/          # Rate limiting, logging
├── migrations/              # Alembic migrations
└── tests/                   # pytest tests (uses SQLite in-memory)
```

## Frontend Structure

```
frontend/src/
├── components/
│   ├── features/
│   │   ├── admin/           # Test builder, question editor
│   │   └── exam/            # Exam UI (calculator, navigator, viewer)
│   ├── layout/              # AdminLayout, StudentLayout, ProtectedRoute
│   └── ui/                  # Radix-based shadcn/ui components
├── pages/
│   ├── admin/               # Admin dashboard, test management
│   ├── auth/                # Login, Register
│   ├── exam/                # Exam taking page
│   └── student/             # Dashboard, results, drill practice
├── services/                # API client functions (exam.ts, auth.ts, etc.)
├── store/                   # Zustand stores (auth.ts, exam.ts)
├── types/                   # TypeScript type definitions
├── hooks/                   # Custom React hooks
└── lib/
    ├── axios.ts             # Axios instance with auth interceptor
    ├── latex.ts             # KaTeX math rendering utilities
    └── utils.ts             # cn() and helpers
```

## SAT Test Structure

The digital SAT has a specific structure that's core to this platform:

- **Sections**: `READING_WRITING` and `MATH`
- **Modules**: Each section has 2 modules (`MODULE_1`, `MODULE_2`)
- **Adaptive Testing**: Module 2 difficulty depends on Module 1 performance
  - ≥70% correct → `HARDER` module
  - ≤40% correct → `EASIER` module
  - Otherwise → `STANDARD` module
- **Question Types**: `MULTIPLE_CHOICE` and `STUDENT_PRODUCED_RESPONSE` (grid-in for math)
- **Content Domains**:
  - RW: Craft & Structure, Information & Ideas, Standard English Conventions, Expression of Ideas
  - Math: Algebra, Advanced Math, Problem Solving & Data Analysis, Geometry & Trigonometry

## Coding Conventions

### Backend (Python/FastAPI)

- All database operations and route handlers MUST be `async`
- Use `await db.execute(...)` for SQLAlchemy queries
- Models: Inherit from `app.core.database.Base` and use `TimestampMixin`
- Use SQLAlchemy 2.0 style `Mapped` and `mapped_column` for type safety
- Schemas: Use Pydantic V2 with separate `Create`, `Update`, and `Response` schemas
- Use `Annotated` dependencies: `db: Annotated[AsyncSession, Depends(get_db)]`
- Use `selectinload` for eager loading to avoid N+1 queries
- Auth dependencies: `CurrentUser`, `ActiveUser`, `AdminUser`, `TeacherOrAdmin`

### Frontend (React/TypeScript)

- State: Zustand for global state, React Query for server state
- Forms: react-hook-form with zod validation
- UI: shadcn/ui components (Radix primitives + Tailwind)
- Math: KaTeX for LaTeX rendering via `MathRenderer` and `RichContent` components
- API: All calls through `lib/axios.ts` (handles token refresh automatically)

## Key Patterns

### Exam State Persistence

The `useExamStore` (Zustand with persist middleware) saves exam state to localStorage for recovery:
- `attemptId`, `currentModule`, `answers`, `flags`, `timeLeft`, `zoomLevel`
- Auto-resumes if user refreshes during an exam

### Token Refresh Flow

`lib/axios.ts` intercepts 401 responses and:
1. Queues failed requests while refreshing
2. Calls `/auth/refresh` to get new token
3. Retries queued requests with new token
4. Redirects to login only if refresh fails (except during active exam)

### Question Format

Questions support images in text and options:
```python
{
    "question_text": "What is shown?",
    "question_image_url": "https://...",
    "options": [
        {"id": "A", "text": "Option A", "image_url": null},
        {"id": "B", "text": "", "image_url": "https://..."},  # Image-only
    ],
    "correct_answer": ["A"],  # List for grid-in with multiple formats
    "skill_tags": ["reading-comprehension"],
    "domain": "information_and_ideas",
}
```

## Testing

Backend tests use SQLite in-memory. Key fixtures in `tests/conftest.py`:
- `test_user`, `test_teacher`, `test_admin` - User fixtures with JWT tokens
- `test_full_sat` - Complete SAT test with all modules and questions
- `test_content`, `test_content_category` - Educational content fixtures

## Environment Variables

Backend: Set via `app/core/config.py` (pydantic-settings)
Frontend: `VITE_API_URL` (defaults to `http://localhost:8000/api/v1`)
