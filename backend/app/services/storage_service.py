"""
S3-compatible storage service for handling file uploads.
Supports AWS S3, MinIO, DigitalOcean Spaces, etc.
"""

import uuid
from datetime import timedelta
from io import BytesIO
from typing import BinaryIO

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings


class StorageService:
    def __init__(self):
        self.client = None
        self._initialize_client()

    def _initialize_client(self):
        """Initialize S3 client with configuration."""
        if not settings.s3_access_key_id:
            return

        config = Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        )

        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            config=config,
        )

    def _generate_key(self, folder: str, filename: str) -> str:
        """Generate a unique key for the file."""
        ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
        unique_id = uuid.uuid4().hex[:8]
        new_filename = f"{uuid.uuid4().hex[:16]}_{unique_id}"
        if ext:
            new_filename += f".{ext}"
        return f"{folder}/{new_filename}"

    async def upload_file(
        self,
        file: BinaryIO,
        filename: str,
        folder: str = "uploads",
        content_type: str | None = None,
    ) -> str:
        """
        Upload a file to S3 and return its URL.

        Args:
            file: File-like object to upload
            filename: Original filename (used for extension)
            folder: S3 folder/prefix
            content_type: MIME type of the file

        Returns:
            Public URL of the uploaded file
        """
        if not self.client:
            raise RuntimeError("Storage service not configured")

        key = self._generate_key(folder, filename)

        extra_args = {}
        if content_type:
            extra_args["ContentType"] = content_type

        # Read file content
        if hasattr(file, "read"):
            content = file.read()
        else:
            content = file

        self.client.upload_fileobj(
            BytesIO(content),
            settings.s3_bucket_name,
            key,
            ExtraArgs=extra_args,
        )

        # Generate URL
        if settings.s3_endpoint_url:
            url = f"{settings.s3_endpoint_url}/{settings.s3_bucket_name}/{key}"
        else:
            url = f"https://{settings.s3_bucket_name}.s3.{settings.s3_region}.amazonaws.com/{key}"

        return url

    async def get_presigned_upload_url(
        self,
        filename: str,
        folder: str = "uploads",
        content_type: str | None = None,
        expires_in: int = 3600,
    ) -> dict:
        """
        Generate a presigned URL for direct client upload.

        Returns:
            Dict with 'url' and 'fields' for the upload
        """
        if not self.client:
            raise RuntimeError("Storage service not configured")

        key = self._generate_key(folder, filename)

        conditions = [
            {"bucket": settings.s3_bucket_name},
            ["starts-with", "$key", folder],
        ]

        if content_type:
            conditions.append({"Content-Type": content_type})

        presigned = self.client.generate_presigned_post(
            Bucket=settings.s3_bucket_name,
            Key=key,
            Conditions=conditions,
            ExpiresIn=expires_in,
        )

        return {
            "url": presigned["url"],
            "fields": presigned["fields"],
            "key": key,
        }

    async def get_presigned_download_url(
        self,
        key: str,
        expires_in: int = 3600,
    ) -> str:
        """Generate a presigned URL for downloading a file."""
        if not self.client:
            raise RuntimeError("Storage service not configured")

        url = self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.s3_bucket_name,
                "Key": key,
            },
            ExpiresIn=expires_in,
        )

        return url

    async def delete_file(self, key: str) -> bool:
        """Delete a file from S3."""
        if not self.client:
            raise RuntimeError("Storage service not configured")

        try:
            self.client.delete_object(
                Bucket=settings.s3_bucket_name,
                Key=key,
            )
            return True
        except ClientError:
            return False

    async def file_exists(self, key: str) -> bool:
        """Check if a file exists in S3."""
        if not self.client:
            raise RuntimeError("Storage service not configured")

        try:
            self.client.head_object(
                Bucket=settings.s3_bucket_name,
                Key=key,
            )
            return True
        except ClientError:
            return False


# Singleton instance
storage_service = StorageService()
