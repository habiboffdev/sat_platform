import os
import shutil
import uuid
from typing import Annotated

from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.deps import AdminUser

router = APIRouter(prefix="/uploads", tags=["Uploads"])

UPLOAD_DIR = "static/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/image")
async def upload_image(
    file: Annotated[UploadFile, File()],
    admin: AdminUser,
):
    """Upload an image file."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
    # Return URL (assuming static files are mounted at /static)
    return {"url": f"/static/uploads/{filename}"}
