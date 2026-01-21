from app.models.base import Base, TimestampMixin
from app.models.enums import (
    AttemptStatus,
    ContentType,
    ModuleDifficulty,
    QuestionDifficulty,
    QuestionDomain,
    QuestionType,
    SATModule,
    SATSection,
    SubscriptionPlan,
    SubscriptionStatus,
    TestScope,
    TestType,
    UserRole,
)
# OCR-specific enums: OCRJobStatus, OCRProvider, QuestionReviewStatus
# Import from app.models.enums or app.models.ocr when needed
from app.models.user import RefreshToken, Subscription, User
from app.models.test import (
    AttemptAnswer,
    ModuleResult,
    Passage,
    Question,
    Test,
    TestAttempt,
    TestModule,
)
from app.models.content import Content, ContentCategory, ContentProgress
from app.models.organization import (
    Assignment,
    AssignmentSubmission,
    Class,
    ClassStudent,
    Organization,
    OrganizationMember,
    StudentAssignment,
)
from app.models.analytics import (
    Achievement,
    DomainProgress,
    Leaderboard,
    Notification,
    PlatformAnalytics,
    ScoreHistory,
    StudentAnalytics,
    StudyPlan,
    StudyPlanTask,
    StudySession,
    UserAchievement,
)
# OCR models are imported separately to avoid circular deps and enum conflicts
# Import directly from app.models.ocr when needed
# from app.models.ocr import ExtractedQuestion, OCRJob, OCRJobPage

__all__ = [
    # Base
    "Base",
    "TimestampMixin",
    # Enums
    "AttemptStatus",
    "ContentType",
    "ModuleDifficulty",
    "QuestionDifficulty",
    "QuestionDomain",
    "QuestionType",
    "SATModule",
    "SATSection",
    "SubscriptionPlan",
    "SubscriptionStatus",
    "TestScope",
    "TestType",
    "UserRole",
    # User models
    "RefreshToken",
    "Subscription",
    "User",
    # Test models
    "AttemptAnswer",
    "ModuleResult",
    "Passage",
    "Question",
    "Test",
    "TestAttempt",
    "TestModule",
    # Content models
    "Content",
    "ContentCategory",
    "ContentProgress",
    # Organization models
    "Assignment",
    "AssignmentSubmission",
    "Class",
    "ClassStudent",
    "Organization",
    "OrganizationMember",
    "StudentAssignment",
    # Analytics models
    "Achievement",
    "DomainProgress",
    "Leaderboard",
    "Notification",
    "PlatformAnalytics",
    "ScoreHistory",
    "StudentAnalytics",
    "StudyPlan",
    "StudyPlanTask",
    "StudySession",
    "UserAchievement",
    # OCR models - import from app.models.ocr directly
    # "ExtractedQuestion", "OCRJob", "OCRJobPage",
    # OCR enums - import from app.models.enums directly
    # "OCRJobStatus", "OCRProvider", "QuestionReviewStatus",
]
