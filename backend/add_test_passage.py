#!/usr/bin/env python3
"""
Script to add a sample passage to existing questions for testing Bluebook UI.
Run: python add_test_passage.py
"""

import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Import from your app
import sys
sys.path.insert(0, '.')

from app.core.database import async_session_maker
from app.models.test import Question, Passage, TestModule


SAMPLE_PASSAGE = """
<p>The development of renewable energy sources has become a critical focus for governments and corporations worldwide. As the effects of climate change become increasingly apparent, the urgency to transition away from fossil fuels has intensified. Solar and wind power, once considered niche alternatives, now represent the fastest-growing segments of the energy sector.</p>

<p>Dr. Sarah Chen, a leading researcher at the National Renewable Energy Laboratory, explains: "What we're witnessing is nothing short of an energy revolution. The cost of solar panels has dropped by more than 90% over the past decade, making renewable energy not just environmentally responsible, but economically competitive."</p>

<p>This transformation has not been without challenges. Traditional energy companies have faced difficult decisions about their future direction, while communities dependent on fossil fuel industries worry about economic disruption. However, studies suggest that the renewable energy sector is creating jobs at a rate that could offset losses in traditional energy employment.</p>

<p>The implications extend beyond economics. Reduced reliance on imported fossil fuels enhances national security, while cleaner air improves public health outcomes. Cities that have aggressively pursued renewable energy report measurable improvements in air quality and related reductions in respiratory illnesses.</p>
"""


async def add_passage_to_questions():
    """Add a sample passage to Reading & Writing questions."""
    async with async_session_maker() as session:
        # Create a new passage
        passage = Passage(
            title="The Renewable Energy Revolution",
            content=SAMPLE_PASSAGE,
            source="Adapted from Scientific American, 2024",
            author="Staff Writers",
            word_count=250,
            genre="science",
            topic_tags=["energy", "climate", "technology"]
        )
        session.add(passage)
        await session.flush()  # Get the passage ID
        
        print(f"Created passage with ID: {passage.id}")
        
        # Find Reading & Writing questions without passages
        result = await session.execute(
            select(Question)
            .join(TestModule)
            .where(
                TestModule.section == "reading_writing",
                Question.passage_id.is_(None)
            )
            .limit(5)  # Update first 5 questions
        )
        questions = result.scalars().all()
        
        if not questions:
            print("No Reading & Writing questions without passages found.")
            return
        
        # Update questions to use this passage
        for q in questions:
            q.passage_id = passage.id
            print(f"  Updated question {q.id}: {q.question_text[:50]}...")
        
        await session.commit()
        print(f"\nSuccessfully added passage to {len(questions)} questions!")
        print("Refresh your exam page to see the Bluebook split-pane layout.")


if __name__ == "__main__":
    asyncio.run(add_passage_to_questions())
