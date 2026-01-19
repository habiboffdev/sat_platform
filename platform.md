Alright, let me design a practical architecture you can vibe code in a day. Given your competitive programming background and experience with OQIM, you'll move fast — but we need to keep scope tight.
System Architecture
Core Principle: Monolith First
Don't microservice this. You have 1 day. Single FastAPI backend, single React frontend, single PostgreSQL database.
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                   React + shadcn/ui + Vite                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Auth    │  │  Tests   │  │  Learn   │  │  Admin   │    │
│  │  Pages   │  │  Module  │  │  Module  │  │  Panel   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────┐
│                        BACKEND                               │
│                    FastAPI + SQLAlchemy                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Auth    │  │  Tests   │  │  Content │  │  Billing │    │
│  │  Module  │  │  Engine  │  │  Manager │  │  Module  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                       DATABASE                               │
│                      PostgreSQL                              │
│  users, subscriptions, tests, questions, attempts, content  │
└─────────────────────────────────────────────────────────────┘

Database Schema (PostgreSQL)
sql-- Core tables only, extend later

-- Users & Auth
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'student', -- student, teacher, admin
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions
CREATE TABLE subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    plan VARCHAR(50) NOT NULL, -- free, basic, premium
    status VARCHAR(50) DEFAULT 'active',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Test Structure
CREATE TABLE tests (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50), -- full_test, section_test, mini_test
    section VARCHAR(50), -- reading, writing, math
    time_limit_minutes INT,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE questions (
    id SERIAL PRIMARY KEY,
    test_id INT REFERENCES tests(id),
    section VARCHAR(50),
    question_number INT,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50), -- mcq, grid_in
    options JSONB, -- ["A", "B", "C", "D"] for MCQ
    correct_answer VARCHAR(255),
    explanation TEXT,
    difficulty VARCHAR(50), -- easy, medium, hard
    tags JSONB, -- ["algebra", "linear-equations"]
    created_at TIMESTAMP DEFAULT NOW()
);

-- Student Attempts
CREATE TABLE test_attempts (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    test_id INT REFERENCES tests(id),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    answers JSONB, -- {question_id: answer}
    score INT,
    section_scores JSONB -- {reading: 35, writing: 38, math: 40}
);

-- Educational Content
CREATE TABLE content (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- video, article, practice
    section VARCHAR(50),
    topic VARCHAR(255),
    body TEXT, -- markdown or HTML
    video_url VARCHAR(500),
    order_index INT,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE content_progress (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    content_id INT REFERENCES content(id),
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP,
    UNIQUE(user_id, content_id)
);
```

---

## Backend Structure (FastAPI)
```
backend/
├── main.py
├── config.py
├── database.py
├── models/
│   ├── user.py
│   ├── test.py
│   ├── content.py
│   └── subscription.py
├── schemas/
│   ├── user.py
│   ├── test.py
│   └── content.py
├── routers/
│   ├── auth.py          # login, register, refresh token
│   ├── tests.py         # CRUD tests, submit attempt
│   ├── content.py       # CRUD content, track progress
│   ├── admin.py         # admin-only endpoints
│   └── subscriptions.py # payment, plan management
├── services/
│   ├── auth_service.py
│   ├── test_service.py
│   └── scoring_service.py
├── middleware/
│   └── auth.py          # JWT validation
└── utils/
    └── security.py      # password hashing, JWT
Key Endpoints
python# Auth
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me

# Tests (student)
GET    /api/tests                    # list available tests
GET    /api/tests/{id}               # get test with questions
POST   /api/tests/{id}/start         # create attempt
POST   /api/tests/{id}/submit        # submit answers, get score
GET    /api/tests/attempts           # my attempt history

# Content (student)
GET    /api/content                  # list by section/topic
GET    /api/content/{id}             # get content
POST   /api/content/{id}/complete    # mark done

# Admin
GET    /api/admin/users              # list users
PUT    /api/admin/users/{id}         # update user
POST   /api/admin/tests              # create test
PUT    /api/admin/tests/{id}         # update test
POST   /api/admin/questions          # add question
PUT    /api/admin/questions/{id}     # update question
POST   /api/admin/content            # create content
GET    /api/admin/analytics          # dashboard stats

# Subscriptions
GET    /api/subscriptions/plans
POST   /api/subscriptions/subscribe
GET    /api/subscriptions/my
```

---

## Frontend Structure (React + shadcn)
```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── api/
│   │   └── client.ts        # axios instance with interceptors
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useTests.ts
│   ├── store/
│   │   └── authStore.ts     # zustand for auth state
│   ├── components/
│   │   ├── ui/              # shadcn components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── test/
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── Timer.tsx
│   │   │   └── ResultCard.tsx
│   │   └── admin/
│   │       ├── DataTable.tsx
│   │       └── QuestionEditor.tsx
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.tsx
│   │   │   └── Register.tsx
│   │   ├── student/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TestList.tsx
│   │   │   ├── TakeTest.tsx
│   │   │   ├── TestResult.tsx
│   │   │   └── Learn.tsx
│   │   └── admin/
│   │       ├── AdminDashboard.tsx
│   │       ├── ManageUsers.tsx
│   │       ├── ManageTests.tsx
│   │       ├── QuestionBank.tsx
│   │       └── ManageContent.tsx
│   └── lib/
│       └── utils.ts
```

---

## Auth Flow (JWT)
```
1. User logs in → backend returns access_token (15min) + refresh_token (7d)
2. Store access_token in memory, refresh_token in httpOnly cookie
3. Axios interceptor adds Authorization header
4. On 401, try refresh; if fails, redirect to login
Use python-jose for JWT, passlib[bcrypt] for passwords.

One-Day Shipping Strategy
Hour-by-hour breakdown:
Hours 1-2: Setup

Init FastAPI project with proper structure
Init React + Vite + shadcn
Setup PostgreSQL, run migrations
Basic auth endpoints working

Hours 3-5: Core Backend

Complete auth system with JWT
Test CRUD + attempt submission
Scoring logic
Content endpoints

Hours 6-8: Core Frontend

Auth pages (login/register)
Student dashboard
Test taking interface (this is the critical path)
Basic results display

Hours 9-11: Admin Panel

User management table
Test/question CRUD forms
Content management
Use shadcn DataTable heavily

Hours 12: Polish & Deploy

Error handling
Basic validation
Deploy to Railway/Render (one-click PostgreSQL)


What to Skip for Day 1
Skip these, add later:

Email verification (just allow login immediately)
Password reset (handle manually for now)
Payment integration (set subscriptions manually via admin)
AI features (placeholder the endpoints)
Complex analytics (just count queries)
File uploads for questions (use markdown/text)


AI Integration Points (Future)
Leave these hooks:
python# In services/ai_service.py (stub for now)
async def explain_question(question_id: int, user_answer: str) -> str:
    # TODO: Call OpenAI/Claude API
    return "AI explanation coming soon"

async def generate_practice_set(user_id: int, weak_topics: list) -> list:
    # TODO: Adaptive question selection
    pass

async def analyze_essay(text: str) -> dict:
    # TODO: SAT essay scoring
    pass
```

---

## Quick Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Auth | JWT in memory + refresh in cookie | Simple, secure enough |
| State mgmt | Zustand | Minimal boilerplate |
| Forms | React Hook Form + Zod | Fast validation |
| Tables | shadcn DataTable + TanStack | Sorting/filtering free |
| API calls | TanStack Query | Caching, loading states |
| Deployment | Railway | Postgres included, fast |

---

## Sample Test-Taking Flow
```
Student clicks "Start Test"
    → POST /api/tests/{id}/start
    → Creates attempt record, returns questions
    
Student answers questions (saved in React state)
    → Timer counts down locally
    
Student clicks "Submit" or timer ends
    → POST /api/tests/{id}/submit {answers: {...}}
    → Backend scores, saves attempt
    → Returns score + correct answers
    
Student views results
    → Shows score, wrong answers with explanations

You'll want me to generate the actual starter code for any specific part? I can give you the FastAPI auth module or the React test-taking component as ready-to-use templates.