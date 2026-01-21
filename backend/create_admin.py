import asyncio
import sys
from sqlalchemy import select
from app.core.database import async_session_maker
from app.models.user import User
from app.models.enums import UserRole
# Import OCR models to resolve relationship
from app.models.ocr import OCRJob, OCRJobPage, ExtractedQuestion  # noqa: F401

async def make_admin(email: str):
    async with async_session_maker() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        
        if not user:
            print(f"User with email {email} not found.")
            return
        
        if user.role == UserRole.ADMIN:
            print(f"User {email} is already an admin.")
            return

        user.role = UserRole.ADMIN
        await session.commit()
        print(f"Successfully promoted {email} to admin.")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python create_admin.py <email>")
        sys.exit(1)
    
    email = sys.argv[1]
    asyncio.run(make_admin(email))
