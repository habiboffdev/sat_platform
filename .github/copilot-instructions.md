# GitHub Copilot Instructions

## Project Overview
This is a **FastAPI** backend for an SAT preparation platform. It uses **PostgreSQL** (via **SQLAlchemy** async) for data persistence and **Pydantic** for data validation.

## Architecture & Core Components
- **Framework**: FastAPI (Async)
- **Database**: PostgreSQL with `asyncpg` driver.
- **ORM**: SQLAlchemy 2.0+ (AsyncSession).
- **Migrations**: Alembic.
- **Authentication**: JWT (Bearer) via `python-jose`.

### Directory Structure
- `app/api/v1/endpoints/`: API route handlers.
- `app/core/`: Core configuration, security, and dependencies.
- `app/models/`: SQLAlchemy ORM models.
- `app/schemas/`: Pydantic data schemas (Request/Response).
- `app/services/`: Business logic layer (encapsulates complex operations).
- `tests/`: Pytest test suite.

## Critical Workflows

### Development
- **Run Server**: `uvicorn app.main:app --reload --port 8000`
- **Database Migrations**:
  - Create: `alembic revision --autogenerate -m "message"`
  - Apply: `alembic upgrade head`

### Testing & Quality
- **Run Tests**: `pytest` (uses `pytest-asyncio`)
- **Linting**: `ruff check .`
- **Formatting**: `ruff format .`
- **Type Checking**: `mypy app/`

## Coding Conventions

### Async/Await
- All database operations and route handlers MUST be `async`.
- Use `await db.execute(...)` for SQLAlchemy queries.

### Database Models (`app/models/`)
- Inherit from `app.core.database.Base`.
- Use `app.models.base.TimestampMixin` for `created_at` and `updated_at` fields.
- Use SQLAlchemy 2.0 style `Mapped` and `mapped_column` for type safety.
- **Example**:
  ```python
  class User(Base, TimestampMixin):
      __tablename__ = "users"
      id: Mapped[int] = mapped_column(primary_key=True)
      email: Mapped[str] = mapped_column(unique=True, index=True)
  ```

### Pydantic Schemas (`app/schemas/`)
- Use Pydantic V2 (`model_config`, `computed_field`).
- Separate schemas for Creation (`UserCreate`), Updates (`UserUpdate`), and Responses (`UserResponse`).
- Use `app.schemas.base.PaginatedResponse` for list endpoints.

### Dependency Injection (`app/core/deps.py`)
- Use `Annotated` for cleaner dependency injection in routes.
- **Common Dependencies**:
  - `db: Annotated[AsyncSession, Depends(get_db)]`
  - `current_user: ActiveUser` (Enforces authentication & active status)
  - `current_user: AdminUser` (Enforces admin role)

### API Endpoints
- Return Pydantic models directly (FastAPI handles serialization).
- Use `selectinload` for eager loading relationships to avoid N+1 queries.
- **Example**:
  ```python
  @router.get("/me", response_model=UserResponse)
  async def get_me(current_user: ActiveUser, db: Annotated[AsyncSession, Depends(get_db)]):
      return current_user
  ```

## Configuration
- Environment variables are managed in `app/core/config.py` using `pydantic-settings`.
- Access settings via `from app.core.config import settings`.
