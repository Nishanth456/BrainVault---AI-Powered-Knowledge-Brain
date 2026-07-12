from minio import Minio
from minio.error import S3Error
from backend.config import settings
import io

client = Minio(
    settings.MINIO_ENDPOINT,
    access_key=settings.MINIO_ACCESS_KEY,
    secret_key=settings.MINIO_SECRET_KEY,
    secure=settings.MINIO_SECURE
)


def ensure_bucket():
    """Create the MinIO bucket if it doesn't exist. Run at startup."""
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
            client.make_bucket(settings.MINIO_BUCKET_NAME)
            print(f"✅ MinIO bucket '{settings.MINIO_BUCKET_NAME}' created")
        else:
            print(f"✅ MinIO bucket '{settings.MINIO_BUCKET_NAME}' already exists")
    except Exception as e:
        print(f"⚠️ MinIO bucket setup failed: {e}")


def upload_bytes(filename: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to MinIO. Returns the storage path."""
    client.put_object(
        settings.MINIO_BUCKET_NAME,
        filename,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type
    )
    return f"{settings.MINIO_BUCKET_NAME}/{filename}"


def get_bytes(minio_path: str) -> bytes:
    """Download file bytes from MinIO by path."""
    # minio_path format: "brainvault-files/filename.pdf"
    filename = minio_path.split("/", 1)[1] if "/" in minio_path else minio_path
    response = client.get_object(settings.MINIO_BUCKET_NAME, filename)
    return response.read()


def delete_object(minio_path: str) -> None:
    """Delete an object from MinIO by path."""
    filename = minio_path.split("/", 1)[1] if "/" in minio_path else minio_path
    try:
        client.remove_object(settings.MINIO_BUCKET_NAME, filename)
    except Exception as e:
        print(f"⚠️ Failed to delete from MinIO: {e}")
