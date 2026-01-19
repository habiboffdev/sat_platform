import asyncio
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.test import Test

async def list_tests():
    async with async_session_maker() as session:
        result = await session.execute(select(Test))
        tests = result.scalars().all()
        print(f"Found {len(tests)} tests:")
        for test in tests:
            print(f"ID: {test.id}, Title: {test.title}, Published: {test.is_published}")

if __name__ == "__main__":
    asyncio.run(list_tests())
