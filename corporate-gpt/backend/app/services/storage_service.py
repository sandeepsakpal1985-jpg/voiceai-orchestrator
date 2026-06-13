"""File storage abstraction - local or S3 compatible."""
import os
import shutil
from typing import Optional, BinaryIO
from app.core.config import settings

STORAGE_PATH = settings.STORAGE_LOCAL_PATH


async def store_file(organization_id: str, document_id: str, filename: str, content: BinaryIO) -> str:
    if settings.STORAGE_BACKEND == "s3" and settings.S3_BUCKET:
        return await _store_s3(document_id, filename, content)
    return await _store_local(organization_id, document_id, filename, content)


async def _store_local(org_id: str, doc_id: str, filename: str, content: BinaryIO) -> str:
    dir_path = os.path.join(STORAGE_PATH, org_id, doc_id)
    os.makedirs(dir_path, exist_ok=True)
    file_path = os.path.join(dir_path, filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(content, f)
    return file_path


async def _store_s3(doc_id: str, filename: str, content: BinaryIO) -> str:
    import boto3
    s3 = boto3.client("s3", endpoint_url=settings.S3_ENDPOINT,
                      aws_access_key_id=settings.S3_ACCESS_KEY,
                      aws_secret_access_key=settings.S3_SECRET_KEY)
    key = f"documents/{doc_id}/{filename}"
    s3.upload_fileobj(content, settings.S3_BUCKET, key)
    return f"s3://{settings.S3_BUCKET}/{key}"


async def get_file(file_path: str):
    return open(file_path, "rb")


async def delete_file(file_path: str):
    if os.path.exists(file_path):
        if os.path.isdir(file_path):
            shutil.rmtree(file_path)
        else:
            os.remove(file_path)
