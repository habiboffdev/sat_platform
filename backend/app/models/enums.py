from enum import Enum


class UserRole(str, Enum):
    STUDENT = "student"
    TEACHER = "teacher"
    ADMIN = "admin"


class SubscriptionPlan(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"


class SubscriptionStatus(str, Enum):
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"
    PENDING = "pending"


class SATSection(str, Enum):
    """SAT has two main sections, each with two modules."""

    READING_WRITING = "reading_writing"
    MATH = "math"


class SATModule(str, Enum):
    """
    SAT digital format: Each section has 2 modules.
    Module 2 difficulty adapts based on Module 1 performance.
    """

    MODULE_1 = "module_1"
    MODULE_2 = "module_2"


class ModuleDifficulty(str, Enum):
    """Module 2 difficulty levels based on Module 1 performance."""

    STANDARD = "standard"
    EASIER = "easier"
    HARDER = "harder"


class TestType(str, Enum):
    FULL_TEST = "full_test"  # Complete SAT with all sections
    SECTION_TEST = "section_test"  # Single section (RW or Math)
    MODULE_TEST = "module_test"  # Single module practice
    MINI_TEST = "mini_test"  # Quick practice set


class QuestionType(str, Enum):
    # Reading & Writing question types
    MULTIPLE_CHOICE = "multiple_choice"

    # Math question types
    MULTIPLE_CHOICE_MATH = "multiple_choice_math"
    STUDENT_PRODUCED_RESPONSE = "student_produced_response"  # Grid-in


class QuestionDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class QuestionDomain(str, Enum):
    """SAT Content Domains"""

    # Reading & Writing domains
    CRAFT_AND_STRUCTURE = "craft_and_structure"
    INFORMATION_AND_IDEAS = "information_and_ideas"
    STANDARD_ENGLISH_CONVENTIONS = "standard_english_conventions"
    EXPRESSION_OF_IDEAS = "expression_of_ideas"

    # Math domains
    ALGEBRA = "algebra"
    ADVANCED_MATH = "advanced_math"
    PROBLEM_SOLVING_DATA_ANALYSIS = "problem_solving_data_analysis"
    GEOMETRY_TRIGONOMETRY = "geometry_trigonometry"


class AttemptStatus(str, Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"
    TIMED_OUT = "timed_out"


class ContentType(str, Enum):
    VIDEO = "video"
    ARTICLE = "article"
    PRACTICE = "practice"
    LESSON = "lesson"


class TestScope(str, Enum):
    """Scope options for test configuration."""
    FULL = "full"  # All modules (RW + Math)
    RW_ONLY = "rw_only"  # Reading & Writing only
    MATH_ONLY = "math_only"  # Math only
    SINGLE_MODULE = "single_module"  # Single module practice
