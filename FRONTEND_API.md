# SAT Platform - Frontend Implementation Guide

This document provides a comprehensive guide for implementing the frontend of the SAT preparation platform. The backend is built with FastAPI and uses JWT authentication.

**Base URL**: `http://localhost:8000/api/v1`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Data Types & Enums](#data-types--enums)
3. [Core API Endpoints](#core-api-endpoints)
4. [Test-Taking Flow](#test-taking-flow)
5. [Analytics & Dashboard](#analytics--dashboard)
6. [Organization/Learning Center](#organizationlearning-center)
7. [Educational Content](#educational-content)
8. [Frontend Architecture Recommendations](#frontend-architecture-recommendations)

---

## Authentication

### Overview
- **Access Token**: Short-lived JWT (30 minutes), sent in `Authorization: Bearer <token>` header
- **Refresh Token**: Long-lived, stored as httpOnly cookie at path `/api/v1/auth`
- Token rotation: Each refresh provides new access + refresh tokens

### Endpoints

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",  // Min 8 chars, 1 uppercase, 1 lowercase, 1 digit
  "full_name": "John Doe",
  "phone": "+1234567890"  // optional
}
```
**Response (201)**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "student",
  "is_active": true,
  "is_verified": false,
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```
**Response (200)**:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800
}
```
*Note: Refresh token set as httpOnly cookie automatically*

#### Refresh Token
```http
POST /auth/refresh
Cookie: refresh_token=xxx
```
**Response (200)**: Same as login response with new tokens

#### Get Current User
```http
GET /auth/me
Authorization: Bearer <access_token>
```
**Response (200)**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "role": "student",
  "is_active": true,
  "is_verified": false,
  "avatar_url": null,
  "last_login_at": "2024-01-15T10:30:00Z",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### Change Password
```http
POST /auth/change-password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "current_password": "OldPass123!",
  "new_password": "NewPass456!"
}
```

#### Logout
```http
POST /auth/logout
Cookie: refresh_token=xxx
```

#### Logout All Devices
```http
POST /auth/logout-all
Authorization: Bearer <access_token>
```

---

## Data Types & Enums

### User Roles
```typescript
type UserRole = "student" | "teacher" | "admin"
```

### SAT Structure
```typescript
// SAT has 2 sections, each with 2 modules
type SATSection = "reading_writing" | "math"
type SATModule = "module_1" | "module_2"

// Module 2 difficulty adapts based on Module 1 performance
type ModuleDifficulty = "standard" | "easier" | "harder"
```

### Test Types
```typescript
type TestType =
  | "full_test"      // Complete SAT (all 4 modules)
  | "section_test"   // One section (2 modules)
  | "module_test"    // Single module
  | "mini_test"      // Quick practice
```

### Question Types
```typescript
type QuestionType =
  | "multiple_choice"           // Reading & Writing
  | "multiple_choice_math"      // Math MCQ
  | "student_produced_response" // Math grid-in

type QuestionDifficulty = "easy" | "medium" | "hard"

type QuestionDomain =
  // Reading & Writing domains
  | "craft_and_structure"
  | "information_and_ideas"
  | "standard_english_conventions"
  | "expression_of_ideas"
  // Math domains
  | "algebra"
  | "advanced_math"
  | "problem_solving_data_analysis"
  | "geometry_trigonometry"
```

### Attempt Status
```typescript
type AttemptStatus = "in_progress" | "completed" | "abandoned" | "timed_out"
```

### Subscription
```typescript
type SubscriptionPlan = "free" | "basic" | "premium"
type SubscriptionStatus = "active" | "expired" | "cancelled" | "pending"
```

---

## Core API Endpoints

### Tests

#### List Available Tests
```http
GET /tests?page=1&page_size=20&test_type=full_test&section=math&is_premium=false
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "items": [
    {
      "id": 1,
      "title": "SAT Practice Test 1",
      "description": "Full-length SAT practice test",
      "test_type": "full_test",
      "section": null,
      "time_limit_minutes": 134,
      "is_published": true,
      "is_premium": false,
      "module_count": 4,
      "total_questions": 98,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 10,
  "page": 1,
  "page_size": 20,
  "total_pages": 1
}
```

#### Get Test Details
```http
GET /tests/{test_id}
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "id": 1,
  "title": "SAT Practice Test 1",
  "description": "Full-length SAT practice test",
  "test_type": "full_test",
  "time_limit_minutes": 134,
  "is_published": true,
  "is_premium": false,
  "modules": [
    {
      "id": 1,
      "section": "reading_writing",
      "module": "module_1",
      "difficulty": "standard",
      "time_limit_minutes": 32,
      "order_index": 0,
      "question_count": 27
    },
    {
      "id": 2,
      "section": "reading_writing",
      "module": "module_2",
      "difficulty": "standard",
      "time_limit_minutes": 32,
      "order_index": 1,
      "question_count": 27
    },
    {
      "id": 3,
      "section": "math",
      "module": "module_1",
      "difficulty": "standard",
      "time_limit_minutes": 35,
      "order_index": 2,
      "question_count": 22
    },
    {
      "id": 4,
      "section": "math",
      "module": "module_2",
      "difficulty": "standard",
      "time_limit_minutes": 35,
      "order_index": 3,
      "question_count": 22
    }
  ]
}
```

---

## Test-Taking Flow

### 1. Start Test Attempt
```http
POST /attempts?test_id=1
Authorization: Bearer <token>
```
**Response (201)**:
```json
{
  "id": 1,
  "test_id": 1,
  "test_title": "SAT Practice Test 1",
  "status": "in_progress",
  "started_at": "2024-01-15T10:30:00Z",
  "completed_at": null,
  "current_module_id": 1,
  "current_question_number": 1
}
```

### 2. Get Current Module with Questions
```http
GET /attempts/{attempt_id}/current-module
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "id": 1,
  "test_id": 1,
  "section": "reading_writing",
  "module": "module_1",
  "difficulty": "standard",
  "time_limit_minutes": 32,
  "question_count": 27,
  "questions": [
    {
      "id": 1,
      "question_number": 1,
      "question_text": "Which choice best describes the function of the underlined portion?",
      "question_type": "multiple_choice",
      "question_image_url": null,
      "options": [
        {"id": "A", "text": "To provide an example...", "image_url": null},
        {"id": "B", "text": "To introduce a contrast...", "image_url": null},
        {"id": "C", "text": "To offer an explanation...", "image_url": null},
        {"id": "D", "text": "To present a conclusion...", "image_url": null}
      ],
      "answer_constraints": null,
      "passage": {
        "id": 1,
        "title": "Passage 1",
        "content": "The development of renewable energy...",
        "source": "Adapted from Scientific American",
        "word_count": 350
      }
    },
    {
      "id": 15,
      "question_number": 15,
      "question_text": "If 3x + 5 = 20, what is the value of x?",
      "question_type": "student_produced_response",
      "question_image_url": "https://cdn.example.com/math/graph1.png",
      "question_image_alt": "A coordinate plane showing a linear function",
      "options": null,
      "answer_constraints": {
        "min": -999,
        "max": 999,
        "allow_fraction": true,
        "allow_decimal": true,
        "allow_negative": true
      },
      "passage": null
    }
  ]
}
```

### 3. Submit Module Answers
```http
POST /attempts/{attempt_id}/submit-module
Authorization: Bearer <token>
Content-Type: application/json

{
  "module_id": 1,
  "answers": [
    {
      "question_id": 1,
      "answer": "B",
      "time_spent_seconds": 45,
      "is_flagged": false
    },
    {
      "question_id": 2,
      "answer": "5",
      "time_spent_seconds": 120,
      "is_flagged": true
    }
  ],
  "time_spent_seconds": 1920
}
```
**Response (200)**:
```json
{
  "status": "in_progress",
  "module_score": {
    "correct": 20,
    "total": 27
  },
  "next_module_id": 2,
  "test_completed": false,
  "total_score": null
}
```

**Response when test is complete**:
```json
{
  "status": "completed",
  "module_score": {
    "correct": 18,
    "total": 22
  },
  "next_module_id": null,
  "test_completed": true,
  "total_score": 1420
}
```

### 4. Get Attempt Details (after completion)
```http
GET /attempts/{attempt_id}
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "id": 1,
  "test_id": 1,
  "test_title": "SAT Practice Test 1",
  "status": "completed",
  "started_at": "2024-01-15T10:30:00Z",
  "completed_at": "2024-01-15T12:45:00Z",
  "reading_writing_raw_score": 47,
  "math_raw_score": 40,
  "reading_writing_scaled_score": 720,
  "math_scaled_score": 700,
  "total_score": 1420,
  "percentile": 94.5
}
```

### 5. List My Attempts
```http
GET /attempts?page=1&page_size=20&status_filter=completed
Authorization: Bearer <token>
```

### 6. Abandon Attempt
```http
POST /attempts/{attempt_id}/abandon
Authorization: Bearer <token>
```

---

## Adaptive Testing Logic

The SAT uses **adaptive testing** for Module 2:

| Module 1 Performance | Module 2 Difficulty |
|---------------------|---------------------|
| ≥70% correct        | **Harder** (higher score potential) |
| 41-69% correct      | **Standard** |
| ≤40% correct        | **Easier** (lower score ceiling) |

The backend automatically selects the appropriate Module 2 difficulty. The frontend receives the correct module in `next_module_id`.

---

## Analytics & Dashboard

### Get My Dashboard Analytics
```http
GET /analytics/me
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "tests_completed": 15,
  "average_score": 1320,
  "highest_score": 1480,
  "total_study_minutes": 2400,
  "current_streak_days": 7,
  "best_streak_days": 14,
  "last_test_date": "2024-01-15T10:30:00Z",
  "score_trend": "improving",
  "predicted_score_range": {
    "low": 1350,
    "high": 1450
  }
}
```

### Get Score History
```http
GET /analytics/me/score-history?limit=20
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "scores": [
    {
      "id": 1,
      "test_attempt_id": 15,
      "total_score": 1420,
      "reading_writing_score": 720,
      "math_score": 700,
      "recorded_at": "2024-01-15T12:45:00Z"
    }
  ]
}
```

### Get Domain Performance
```http
GET /analytics/me/domain-performance
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "domains": {
    "algebra": 0.85,
    "advanced_math": 0.72,
    "geometry_trigonometry": 0.65,
    "craft_and_structure": 0.90
  },
  "skills": {
    "linear_equations": 0.88,
    "quadratics": 0.70,
    "vocabulary_in_context": 0.92
  },
  "weak_domains": ["geometry_trigonometry"],
  "strong_domains": ["craft_and_structure", "algebra"],
  "weak_skills": ["quadratics"],
  "strong_skills": ["vocabulary_in_context"]
}
```

### Get Leaderboard
```http
GET /analytics/leaderboard?scope_type=global&period_type=weekly&limit=50
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "user_id": 42,
      "user_name": "John D.",
      "avatar_url": "https://...",
      "score": 1580,
      "tests_completed": 12,
      "average_accuracy": 0.94
    }
  ],
  "my_rank": 15,
  "scope_type": "global",
  "period_type": "weekly"
}
```

### Get Notifications
```http
GET /analytics/notifications?unread_only=true&limit=50
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "notifications": [
    {
      "id": 1,
      "title": "New Achievement!",
      "message": "You've completed 10 practice tests!",
      "type": "achievement",
      "action_url": "/achievements",
      "is_read": false,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "unread_count": 3
}
```

### Mark Notification as Read
```http
POST /analytics/notifications/{notification_id}/read
Authorization: Bearer <token>
```

### Mark All Notifications as Read
```http
POST /analytics/notifications/read-all
Authorization: Bearer <token>
```

---

## Study Plans

### Get My Study Plans
```http
GET /analytics/study-plans
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "plans": [
    {
      "id": 1,
      "title": "30-Day SAT Prep",
      "description": "Comprehensive preparation for June SAT",
      "target_score": 1500,
      "target_date": "2024-06-01",
      "total_tasks": 30,
      "completed_tasks": 12,
      "progress_percent": 40,
      "is_active": true,
      "is_ai_generated": true
    }
  ]
}
```

### Get Study Plan Details
```http
GET /analytics/study-plans/{plan_id}
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "plan": {
    "id": 1,
    "title": "30-Day SAT Prep",
    "focus_domains": ["algebra", "geometry_trigonometry"],
    "focus_skills": ["quadratics", "linear_equations"],
    "weekly_schedule": {
      "monday": ["math_practice", "review"],
      "tuesday": ["reading_practice"],
      "wednesday": ["full_test"],
      "thursday": ["math_practice"],
      "friday": ["reading_practice", "review"]
    }
  },
  "tasks": [
    {
      "id": 1,
      "title": "Complete Algebra Basics Quiz",
      "description": "Focus on linear equations",
      "task_type": "quiz",
      "target_id": 5,
      "due_date": "2024-01-16",
      "day_of_week": 1,
      "estimated_minutes": 30,
      "is_completed": false,
      "domain": "algebra",
      "skills": ["linear_equations"]
    }
  ]
}
```

### Complete Study Plan Task
```http
POST /analytics/study-plans/{plan_id}/tasks/{task_id}/complete
Authorization: Bearer <token>
```

---

## Organization/Learning Center

### Get My Organizations
```http
GET /organizations
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "items": [
    {
      "id": 1,
      "name": "ABC Learning Center",
      "slug": "abc-learning",
      "description": "Premier SAT prep in NYC",
      "logo_url": "https://...",
      "primary_color": "#3B82F6",
      "member_count": 150,
      "is_active": true
    }
  ],
  "total": 1
}
```

### Get My Classes
```http
GET /organizations/{org_id}/classes
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "items": [
    {
      "id": 1,
      "name": "SAT Weekend Prep - Spring 2024",
      "description": "Weekend SAT preparation class",
      "schedule": {
        "days": ["Saturday", "Sunday"],
        "time": "10:00 AM - 1:00 PM"
      },
      "student_count": 25,
      "teacher": {
        "id": 5,
        "full_name": "Jane Smith",
        "avatar_url": "https://..."
      },
      "start_date": "2024-01-15",
      "end_date": "2024-05-15"
    }
  ]
}
```

### Get My Assignments
```http
GET /organizations/assignments/mine?status=pending
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "items": [
    {
      "id": 1,
      "title": "Week 1 Practice Test",
      "description": "Complete the full practice test",
      "test_id": 5,
      "due_date": "2024-01-20T23:59:00Z",
      "created_at": "2024-01-15T10:00:00Z",
      "submission": null
    }
  ]
}
```

### Submit Assignment
```http
POST /organizations/assignments/{assignment_id}/submit
Authorization: Bearer <token>
Content-Type: application/json

{
  "attempt_id": 15,
  "notes": "Completed during study session"
}
```

---

## Educational Content

### List Content
```http
GET /content?page=1&category_id=1&section=math&domain=algebra&content_type=video&search=quadratic
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "items": [
    {
      "id": 1,
      "title": "Solving Quadratic Equations",
      "slug": "solving-quadratic-equations",
      "description": "Learn the three methods for solving quadratics",
      "content_type": "video",
      "video_url": "https://cdn.example.com/videos/quadratics.mp4",
      "video_duration_seconds": 840,
      "video_thumbnail_url": "https://...",
      "section": "math",
      "domain": "algebra",
      "skill_tags": ["quadratics", "factoring"],
      "is_premium": false,
      "estimated_time_minutes": 15
    }
  ],
  "total": 45,
  "page": 1,
  "page_size": 20,
  "total_pages": 3
}
```

### Get Content Details
```http
GET /content/{content_id}
Authorization: Bearer <token>
```
**Response (200)**:
```json
{
  "id": 1,
  "title": "Solving Quadratic Equations",
  "body": "<markdown or HTML content>",
  "video_url": "https://...",
  "resources": [
    {
      "type": "pdf",
      "title": "Quadratics Worksheet",
      "url": "https://..."
    }
  ],
  "progress": {
    "id": 1,
    "is_completed": false,
    "completed_at": null,
    "progress_percent": 45,
    "last_position_seconds": 378,
    "total_time_seconds": 420,
    "notes": "Review factoring section"
  }
}
```

### Update Content Progress
```http
POST /content/{content_id}/progress
Authorization: Bearer <token>
Content-Type: application/json

{
  "progress_percent": 75,
  "last_position_seconds": 630,
  "time_spent_seconds": 120,
  "is_completed": false,
  "notes": "Need to review discriminant formula"
}
```

### Get Content Categories
```http
GET /content/categories
Authorization: Bearer <token>
```

---

## Admin Endpoints

All admin endpoints require `role: "admin"`.

### Tests Management
- `GET /tests/admin/all` - List all tests (including unpublished)
- `POST /tests` - Create test
- `PATCH /tests/{test_id}` - Update test
- `DELETE /tests/{test_id}` - Delete test

### Module Management
- `POST /tests/{test_id}/modules` - Create module
- `PATCH /tests/modules/{module_id}` - Update module
- `DELETE /tests/modules/{module_id}` - Delete module

### Question Management
- `POST /tests/modules/{module_id}/questions` - Create question
- `GET /tests/modules/{module_id}/questions` - List questions
- `PATCH /tests/questions/{question_id}` - Update question
- `DELETE /tests/questions/{question_id}` - Delete question

### Platform Analytics (Admin)
```http
GET /analytics/platform?period_type=daily&days=30
Authorization: Bearer <admin_token>
```

### Score Distribution (Admin)
```http
GET /analytics/platform/score-distribution
Authorization: Bearer <admin_token>
```

---

## Frontend Architecture Recommendations

### Recommended Tech Stack
- **Framework**: React 18+ with TypeScript
- **State Management**: Zustand or Redux Toolkit
- **Data Fetching**: TanStack Query (React Query)
- **Routing**: React Router v6
- **UI Components**: Tailwind CSS + Radix UI or shadcn/ui
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts or Chart.js

### Key Frontend Components

```
src/
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── PasswordChangeForm.tsx
│   ├── test/
│   │   ├── TestCard.tsx
│   │   ├── QuestionRenderer.tsx      # Handles all question types
│   │   ├── AnswerInput.tsx           # MCQ + Grid-in inputs
│   │   ├── PassagePanel.tsx          # Reading passage display
│   │   ├── TimerDisplay.tsx          # Module countdown timer
│   │   ├── QuestionNavigation.tsx    # Jump to question / flag
│   │   └── TestReview.tsx            # Post-test review
│   ├── analytics/
│   │   ├── ScoreChart.tsx
│   │   ├── DomainBreakdown.tsx
│   │   ├── Leaderboard.tsx
│   │   └── StudyPlanCard.tsx
│   └── layout/
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── NotificationBell.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── TestList.tsx
│   ├── TestDetail.tsx
│   ├── TestSession.tsx              # Main test-taking page
│   ├── TestResults.tsx
│   ├── Analytics.tsx
│   ├── Content.tsx
│   ├── StudyPlan.tsx
│   └── admin/
│       ├── TestEditor.tsx
│       ├── QuestionEditor.tsx
│       └── PlatformAnalytics.tsx
├── hooks/
│   ├── useAuth.ts                   # Auth state + token refresh
│   ├── useTestAttempt.ts            # Test-taking state machine
│   ├── useTimer.ts                  # Countdown timer with warnings
│   └── useNotifications.ts
├── services/
│   ├── api.ts                       # Axios instance with interceptors
│   ├── authService.ts
│   ├── testService.ts
│   └── analyticsService.ts
├── stores/
│   ├── authStore.ts
│   ├── testStore.ts                 # Current attempt state
│   └── notificationStore.ts
└── types/
    ├── auth.ts
    ├── test.ts
    ├── analytics.ts
    └── organization.ts
```

### Critical Features to Implement

#### 1. Test-Taking Session
- **Timer**: Per-module countdown (32-35 min) with warnings at 5min, 1min
- **Question Navigation**: Grid showing answered/flagged/unanswered
- **Auto-save**: Periodically save answers to localStorage + server
- **Pause/Resume**: Handle browser close/refresh gracefully
- **Section Break**: 10-minute break between RW and Math sections

#### 2. Question Renderer
```tsx
// Handle all question types
interface QuestionRendererProps {
  question: Question;
  selectedAnswer: string | null;
  onAnswerChange: (answer: string) => void;
  isFlagged: boolean;
  onToggleFlag: () => void;
}

// For student-produced response (grid-in)
interface GridInInputProps {
  value: string;
  onChange: (value: string) => void;
  constraints: AnswerConstraints;
}
```

#### 3. Image Support
- Questions can have images (`question_image_url`)
- Options can have images (`options[].image_url`)
- Passages can have figures (`passage.figures[]`)
- Use lazy loading and proper alt text

#### 4. Accessibility
- Keyboard navigation for all question types
- Screen reader support for passages and questions
- High contrast mode support
- Font size adjustment

#### 5. Offline Support
- Cache test content after starting attempt
- Queue answer submissions when offline
- Sync when connection restored

### Token Refresh Strategy

```typescript
// Axios interceptor for automatic token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const { data } = await api.post('/auth/refresh');
        // Update stored access token
        setAccessToken(data.access_token);
        // Retry original request
        error.config.headers.Authorization = `Bearer ${data.access_token}`;
        return api(error.config);
      } catch (refreshError) {
        // Redirect to login
        logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
```

### Error Handling

All API errors follow this format:
```json
{
  "detail": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad request (validation error)
- `401` - Unauthorized (token expired/invalid)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `422` - Validation error (with field details)
- `500` - Server error

---

## SAT Test Structure Reference

### Full SAT Test Format
| Section | Module | Time | Questions |
|---------|--------|------|-----------|
| Reading & Writing | Module 1 | 32 min | 27 questions |
| Reading & Writing | Module 2 | 32 min | 27 questions |
| *Break* | - | *10 min* | - |
| Math | Module 1 | 35 min | 22 questions |
| Math | Module 2 | 35 min | 22 questions |
| **Total** | | **134 min** | **98 questions** |

### Scoring
- **Raw Score**: Number of correct answers (no penalty for wrong answers)
- **Scaled Score**: 200-800 per section
- **Total Score**: 400-1600 (sum of both sections)

---

## WebSocket Events (Future)

For real-time features, consider implementing:
- `test.timer.sync` - Sync remaining time with server
- `notification.new` - Push new notifications
- `leaderboard.update` - Real-time leaderboard changes
- `class.announcement` - Teacher announcements

---

## Rate Limits

- **Authentication**: 5 requests/minute per IP
- **General API**: 100 requests/minute per user
- **Test Submission**: 10 requests/minute per user

---

*Document Version: 1.0*
*Last Updated: 2024*
