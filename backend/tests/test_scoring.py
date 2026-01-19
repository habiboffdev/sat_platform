"""
Tests for SAT scoring service.
"""

import pytest

from app.models.enums import ModuleDifficulty, SATSection
from app.services.scoring_service import (
    calculate_section_score,
    calculate_total_score,
    get_percentile,
)


class TestSectionScoring:
    """Tests for section score calculation."""

    def test_reading_writing_perfect_score(self):
        """Test perfect Reading/Writing score."""
        score = calculate_section_score(
            raw_score=54,
            max_raw_score=54,
            section=SATSection.READING_WRITING,
        )

        assert score.raw_score == 54
        assert score.scaled_score >= 750
        assert score.scaled_score <= 800

    def test_reading_writing_zero_score(self):
        """Test zero Reading/Writing score."""
        score = calculate_section_score(
            raw_score=0,
            max_raw_score=54,
            section=SATSection.READING_WRITING,
        )

        assert score.raw_score == 0
        assert score.scaled_score == 200

    def test_math_perfect_score(self):
        """Test perfect Math score."""
        score = calculate_section_score(
            raw_score=44,
            max_raw_score=44,
            section=SATSection.MATH,
        )

        assert score.raw_score == 44
        assert score.scaled_score >= 750
        assert score.scaled_score <= 800

    def test_math_average_score(self):
        """Test average Math score."""
        score = calculate_section_score(
            raw_score=22,
            max_raw_score=44,
            section=SATSection.MATH,
        )

        assert score.raw_score == 22
        assert score.scaled_score >= 450
        assert score.scaled_score <= 550

    def test_adaptive_harder_module_boost(self):
        """Test that harder module gives score boost."""
        standard_score = calculate_section_score(
            raw_score=30,
            max_raw_score=44,
            section=SATSection.MATH,
            module_2_difficulty=ModuleDifficulty.STANDARD,
        )

        harder_score = calculate_section_score(
            raw_score=30,
            max_raw_score=44,
            section=SATSection.MATH,
            module_2_difficulty=ModuleDifficulty.HARDER,
        )

        assert harder_score.scaled_score >= standard_score.scaled_score

    def test_adaptive_easier_module_cap(self):
        """Test that easier module has score ceiling."""
        standard_score = calculate_section_score(
            raw_score=40,
            max_raw_score=44,
            section=SATSection.MATH,
            module_2_difficulty=ModuleDifficulty.STANDARD,
        )

        easier_score = calculate_section_score(
            raw_score=40,
            max_raw_score=44,
            section=SATSection.MATH,
            module_2_difficulty=ModuleDifficulty.EASIER,
        )

        assert easier_score.scaled_score <= 650


class TestTotalScoring:
    """Tests for total score calculation."""

    def test_total_score_perfect(self):
        """Test perfect total score."""
        score = calculate_total_score(
            rw_raw=54,
            rw_max=54,
            math_raw=44,
            math_max=44,
        )

        assert score.total_scaled == score.reading_writing.scaled_score + score.math.scaled_score
        assert score.total_scaled >= 1500
        assert score.total_scaled <= 1600

    def test_total_score_minimum(self):
        """Test minimum total score."""
        score = calculate_total_score(
            rw_raw=0,
            rw_max=54,
            math_raw=0,
            math_max=44,
        )

        assert score.total_scaled == 400  # 200 + 200

    def test_total_score_average(self):
        """Test average total score."""
        score = calculate_total_score(
            rw_raw=27,
            rw_max=54,
            math_raw=22,
            math_max=44,
        )

        assert score.total_scaled >= 800
        assert score.total_scaled <= 1100


class TestPercentile:
    """Tests for percentile calculation."""

    def test_percentile_perfect_score(self):
        """Test percentile for perfect score."""
        percentile = get_percentile(1600)

        assert percentile >= 99

    def test_percentile_average_score(self):
        """Test percentile for average score."""
        percentile = get_percentile(1000)

        assert percentile >= 50
        assert percentile <= 70

    def test_percentile_low_score(self):
        """Test percentile for low score."""
        percentile = get_percentile(500)

        assert percentile <= 10

    def test_percentile_interpolation(self):
        """Test that percentiles interpolate correctly."""
        p_lower = get_percentile(1000)
        p_middle = get_percentile(1050)
        p_upper = get_percentile(1100)

        assert p_lower <= p_middle <= p_upper


class TestScoreConsistency:
    """Tests for score consistency and edge cases."""

    def test_score_increases_with_raw(self):
        """Test that scaled scores increase with raw scores."""
        previous_score = 0

        for raw in range(0, 55, 5):
            score = calculate_section_score(
                raw_score=raw,
                max_raw_score=54,
                section=SATSection.READING_WRITING,
            )
            assert score.scaled_score >= previous_score
            previous_score = score.scaled_score

    def test_score_bounds(self):
        """Test that scores stay within SAT bounds."""
        for raw in range(0, 55):
            rw_score = calculate_section_score(
                raw_score=raw,
                max_raw_score=54,
                section=SATSection.READING_WRITING,
            )
            assert 200 <= rw_score.scaled_score <= 800

        for raw in range(0, 45):
            math_score = calculate_section_score(
                raw_score=raw,
                max_raw_score=44,
                section=SATSection.MATH,
            )
            assert 200 <= math_score.scaled_score <= 800

    def test_total_score_bounds(self):
        """Test that total scores stay within bounds."""
        score = calculate_total_score(
            rw_raw=54,
            rw_max=54,
            math_raw=44,
            math_max=44,
        )
        assert 400 <= score.total_scaled <= 1600

        score = calculate_total_score(
            rw_raw=0,
            rw_max=54,
            math_raw=0,
            math_max=44,
        )
        assert 400 <= score.total_scaled <= 1600
