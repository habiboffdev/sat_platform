"""
SAT Scoring Service

The SAT uses a complex equating process to convert raw scores to scaled scores.
This is a simplified implementation. For production, you would need:
1. Official College Board equating tables
2. Historical test data for calibration
3. IRT (Item Response Theory) models for adaptive testing
"""

from dataclasses import dataclass

from app.models.enums import ModuleDifficulty, SATSection


@dataclass
class SectionScore:
    raw_score: int
    max_raw_score: int
    scaled_score: int
    percentile: float | None = None


@dataclass
class TotalScore:
    reading_writing: SectionScore
    math: SectionScore
    total_scaled: int
    percentile: float | None = None


# Simplified score conversion tables
# Real SAT uses different tables for each test form
RW_SCORE_TABLE = {
    # (raw_score, max_raw_score) -> scaled_score
    # This is a rough approximation
    0: 200,
    5: 250,
    10: 300,
    15: 350,
    20: 400,
    25: 450,
    30: 500,
    35: 550,
    40: 600,
    45: 650,
    50: 700,
    54: 750,
    58: 800,
}

MATH_SCORE_TABLE = {
    0: 200,
    4: 250,
    8: 300,
    12: 350,
    16: 400,
    20: 450,
    24: 500,
    28: 550,
    32: 600,
    36: 650,
    40: 700,
    42: 750,
    44: 800,
}


def _interpolate_score(raw: int, table: dict[int, int]) -> int:
    """Interpolate scaled score from raw score using lookup table."""
    sorted_keys = sorted(table.keys())

    if raw <= sorted_keys[0]:
        return table[sorted_keys[0]]

    if raw >= sorted_keys[-1]:
        return table[sorted_keys[-1]]

    # Find surrounding keys
    for i, key in enumerate(sorted_keys[:-1]):
        next_key = sorted_keys[i + 1]
        if key <= raw < next_key:
            # Linear interpolation
            ratio = (raw - key) / (next_key - key)
            score_range = table[next_key] - table[key]
            return int(table[key] + ratio * score_range)

    return table[sorted_keys[-1]]


def calculate_section_score(
    raw_score: int,
    max_raw_score: int,
    section: SATSection,
    module_2_difficulty: ModuleDifficulty | None = None,
) -> SectionScore:
    """
    Calculate scaled score for a section.

    In real SAT, Module 2 difficulty affects the scoring curve:
    - Harder Module 2: Higher ceiling for scaled score
    - Easier Module 2: Lower ceiling for scaled score
    """
    table = RW_SCORE_TABLE if section == SATSection.READING_WRITING else MATH_SCORE_TABLE
    base_scaled = _interpolate_score(raw_score, table)

    # Adjust for adaptive difficulty
    if module_2_difficulty:
        if module_2_difficulty == ModuleDifficulty.HARDER:
            # Students who got harder questions get a slight boost
            base_scaled = min(800, base_scaled + 20)
        elif module_2_difficulty == ModuleDifficulty.EASIER:
            # Students who got easier questions have a lower ceiling
            base_scaled = min(650, base_scaled)

    return SectionScore(
        raw_score=raw_score,
        max_raw_score=max_raw_score,
        scaled_score=base_scaled,
    )


def calculate_total_score(
    rw_raw: int,
    rw_max: int,
    math_raw: int,
    math_max: int,
    rw_module_2_difficulty: ModuleDifficulty | None = None,
    math_module_2_difficulty: ModuleDifficulty | None = None,
) -> TotalScore:
    """Calculate complete SAT score."""
    rw_score = calculate_section_score(
        rw_raw, rw_max, SATSection.READING_WRITING, rw_module_2_difficulty
    )
    math_score = calculate_section_score(
        math_raw, math_max, SATSection.MATH, math_module_2_difficulty
    )

    total = rw_score.scaled_score + math_score.scaled_score

    return TotalScore(
        reading_writing=rw_score,
        math=math_score,
        total_scaled=total,
    )


# Percentile lookup (approximate, from College Board data)
PERCENTILE_TABLE = {
    400: 1,
    500: 5,
    600: 15,
    700: 25,
    800: 40,
    900: 50,
    1000: 60,
    1100: 70,
    1200: 80,
    1300: 90,
    1400: 95,
    1500: 99,
    1600: 99.9,
}


def get_percentile(total_score: int) -> float:
    """Get approximate percentile for a total score."""
    sorted_scores = sorted(PERCENTILE_TABLE.keys())

    if total_score <= sorted_scores[0]:
        return 1.0

    if total_score >= sorted_scores[-1]:
        return 99.9

    for i, score in enumerate(sorted_scores[:-1]):
        next_score = sorted_scores[i + 1]
        if score <= total_score < next_score:
            ratio = (total_score - score) / (next_score - score)
            percentile_range = PERCENTILE_TABLE[next_score] - PERCENTILE_TABLE[score]
            return PERCENTILE_TABLE[score] + ratio * percentile_range

    return 50.0
