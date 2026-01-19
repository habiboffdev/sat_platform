from datetime import datetime

from pydantic import Field

from app.models.enums import (
    AttemptStatus,
    ModuleDifficulty,
    QuestionDifficulty,
    QuestionDomain,
    QuestionType,
    SATModule,
    SATSection,
    TestType,
)
from app.schemas.base import BaseSchema, PaginatedResponse, TimestampSchema


# === Option Schema ===


class QuestionOption(BaseSchema):
    """Schema for question options (MCQ)."""

    id: str = Field(description="Option identifier: A, B, C, or D")
    text: str = Field(description="Option text content")
    image_url: str | None = Field(default=None, description="Optional image for this option")
    image_alt: str | None = Field(default=None, description="Alt text for option image")


# === Passage Schemas ===


class PassageFigure(BaseSchema):
    """Schema for figures/images within a passage."""

    url: str
    alt: str | None = None
    caption: str | None = None


class PassageBase(BaseSchema):
    """Base passage schema."""

    title: str | None = None
    content: str
    source: str | None = None
    author: str | None = None
    word_count: int | None = None
    figures: list[PassageFigure] | None = None
    genre: str | None = None
    topic_tags: list[str] | None = None


class PassageCreate(PassageBase):
    """Schema for creating a passage."""

    pass


class PassageUpdate(BaseSchema):
    """Schema for updating a passage."""

    title: str | None = None
    content: str | None = None
    source: str | None = None
    author: str | None = None
    figures: list[PassageFigure] | None = None
    genre: str | None = None
    topic_tags: list[str] | None = None


class PassageResponse(PassageBase, TimestampSchema):
    """Schema for passage response."""

    id: int


# === Question Schemas ===


class AnswerConstraints(BaseSchema):
    """Constraints for student-produced response (grid-in) answers."""

    min_value: float | None = Field(default=None, alias="min")
    max_value: float | None = Field(default=None, alias="max")
    allow_fraction: bool = True
    allow_decimal: bool = True
    allow_negative: bool = True


class QuestionBase(BaseSchema):
    """Base question schema."""

    question_number: int
    question_text: str
    question_type: QuestionType
    question_image_url: str | None = None
    question_image_alt: str | None = None
    options: list[QuestionOption] | None = None
    correct_answer: list[str]
    explanation: str | None = None
    explanation_image_url: str | None = None
    difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM
    domain: QuestionDomain | None = None
    skill_tags: list[str] | None = None
    answer_constraints: AnswerConstraints | None = None


class QuestionCreate(QuestionBase):
    """Schema for creating a question."""

    module_id: int | None = None
    passage_id: int | None = None


class QuestionUpdate(BaseSchema):
    """Schema for updating a question."""

    question_number: int | None = None
    question_text: str | None = None
    question_type: QuestionType | None = None
    question_image_url: str | None = None
    question_image_alt: str | None = None
    options: list[QuestionOption] | None = None
    correct_answer: list[str] | None = None
    explanation: str | None = None
    explanation_image_url: str | None = None
    difficulty: QuestionDifficulty | None = None
    domain: QuestionDomain | None = None
    skill_tags: list[str] | None = None
    answer_constraints: AnswerConstraints | None = None
    passage_id: int | None = None


class QuestionResponse(QuestionBase, TimestampSchema):
    """Schema for question response (includes correct answer - for admin/review)."""

    id: int
    module_id: int
    passage_id: int | None = None
    times_answered: int = 0
    times_correct: int = 0


class QuestionStudentView(BaseSchema):
    """Schema for question as seen by student during test (no correct answer)."""

    id: int
    question_number: int
    question_text: str
    question_type: QuestionType
    question_image_url: str | None = None
    question_image_alt: str | None = None
    options: list[QuestionOption] | None = None
    answer_constraints: AnswerConstraints | None = None
    passage: PassageResponse | None = None


class QuestionReviewView(QuestionStudentView):
    """Schema for question in review mode (after submission)."""

    correct_answer: list[str]
    explanation: str | None = None
    explanation_image_url: str | None = None
    user_answer: str | None = None
    is_correct: bool | None = None
    domain: QuestionDomain | None = None
    difficulty: QuestionDifficulty | None = None
    time_spent_seconds: int | None = None


# === Test Module Schemas ===


class TestModuleBase(BaseSchema):
    """Base test module schema."""

    section: SATSection
    module: SATModule
    difficulty: ModuleDifficulty = ModuleDifficulty.STANDARD
    time_limit_minutes: int
    order_index: int = 0


class TestModuleCreate(TestModuleBase):
    """Schema for creating a test module."""

    test_id: int | None = None


class TestModuleUpdate(BaseSchema):
    """Schema for updating a test module."""

    section: SATSection | None = None
    module: SATModule | None = None
    difficulty: ModuleDifficulty | None = None
    time_limit_minutes: int | None = None
    order_index: int | None = None


class TestModuleResponse(TestModuleBase, TimestampSchema):
    """Schema for test module response."""

    id: int
    test_id: int
    question_count: int = 0
    questions: list[QuestionResponse] = []


class TestModuleCreateResponse(TestModuleBase, TimestampSchema):
    """Schema for test module creation response (without questions)."""

    id: int
    test_id: int


class TestModuleWithQuestions(TestModuleResponse):
    """Schema for test module with questions included."""

    questions: list[QuestionStudentView] = []


# === Test Schemas ===


class TestBase(BaseSchema):
    """Base test schema."""

    title: str
    description: str | None = None
    test_type: TestType
    section: SATSection | None = None
    time_limit_minutes: int | None = None
    is_published: bool = False
    is_premium: bool = False
    order_index: int = 0


class TestCreate(TestBase):
    """Schema for creating a test."""

    pass


class TestUpdate(BaseSchema):
    """Schema for updating a test."""

    title: str | None = None
    description: str | None = None
    test_type: TestType | None = None
    section: SATSection | None = None
    time_limit_minutes: int | None = None
    is_published: bool | None = None
    is_premium: bool | None = None
    order_index: int | None = None


class TestResponse(TestBase, TimestampSchema):
    """Schema for test response."""

    id: int
    module_count: int = 0
    total_questions: int = 0


class TestDetailResponse(TestResponse):
    """Schema for detailed test response with modules."""

    modules: list[TestModuleResponse] = []


class TestListResponse(PaginatedResponse):
    """Paginated list of tests."""

    items: list[TestResponse]


# === Test Attempt Schemas ===


class StartTestRequest(BaseSchema):
    """Schema for starting a test attempt."""

    test_id: int


class SubmitAnswerRequest(BaseSchema):
    """Schema for submitting an answer during test."""

    question_id: int
    answer: str | None = None
    time_spent_seconds: int | None = None
    is_flagged: bool = False


class SubmitModuleRequest(BaseSchema):
    """Schema for submitting a complete module."""

    module_id: int
    answers: list[SubmitAnswerRequest]
    time_spent_seconds: int


class AttemptAnswerResponse(BaseSchema):
    """Schema for an answer in attempt response."""

    question_id: int
    answer: str | None = None
    is_correct: bool | None = None
    is_flagged: bool = False
    time_spent_seconds: int | None = None


class ModuleResultResponse(BaseSchema):
    """Schema for module result."""

    module_id: int
    section: SATSection
    module_type: SATModule
    correct_count: int
    total_count: int
    time_spent_seconds: int | None = None
    next_module_difficulty: ModuleDifficulty | None = None


class DomainBreakdown(BaseSchema):
    """Schema for domain performance breakdown."""

    domain: QuestionDomain
    correct: int
    total: int
    percentage: float


class TestAttemptResponse(BaseSchema):
    """Schema for test attempt response."""

    id: int
    test_id: int
    test_title: str
    status: AttemptStatus
    started_at: datetime
    completed_at: datetime | None = None
    current_module_id: int | None = None
    current_question_number: int = 1
    total_score: int | None = None
    time_spent_seconds: int | None = None
    scope: str = "full"


class TestAttemptDetailResponse(TestAttemptResponse):
    """Schema for detailed test attempt with scores."""

    reading_writing_raw_score: int | None = None
    math_raw_score: int | None = None
    reading_writing_scaled_score: int | None = None
    math_scaled_score: int | None = None
    total_score: int | None = None
    percentile: float | None = None
    domain_breakdown: list[DomainBreakdown] | None = None
    module_results: list[ModuleResultResponse] = []


class TestAttemptReviewResponse(TestAttemptDetailResponse):
    """Schema for test attempt review with all answers."""

    answers: list[AttemptAnswerResponse] = []


class AttemptListResponse(PaginatedResponse):
    """Paginated list of attempts."""

    items: list[TestAttemptResponse]
