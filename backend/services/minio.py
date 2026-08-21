from minio import Minio
from backend.config import settings
import io

if settings.ENV_MODE == "cloud":
    # Minio SDK expects the endpoint without http:// or https://
    endpoint = settings.AWS_ENDPOINT_URL_S3.replace("https://", "").replace("http://", "")
    client = Minio(
        endpoint,
        access_key=settings.AWS_ACCESS_KEY_ID,
        secret_key=settings.AWS_SECRET_ACCESS_KEY,
        secure=True
    )
    bucket_name = settings.S3_BUCKET_NAME
else:
    client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE
    )
    bucket_name = settings.MINIO_BUCKET_NAME


def ensure_bucket():
    """Create the MinIO bucket if it doesn't exist. Run at startup."""
    try:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            print(f"MinIO bucket '{bucket_name}' created")
        else:
            print(f"MinIO bucket '{bucket_name}' already exists")
    except Exception as e:
        print(f"MinIO bucket setup failed: {e}")


def upload_bytes(filename: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to MinIO. Returns the storage path."""
    client.put_object(
        bucket_name,
        filename,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type
    )
    return f"{bucket_name}/{filename}"


def get_bytes(minio_path: str) -> bytes:
    """Download file bytes from MinIO by path."""
    # minio_path format: "brainvault-files/filename.pdf"
    filename = minio_path.split("/", 1)[1] if "/" in minio_path else minio_path
    response = client.get_object(bucket_name, filename)
    return response.read()


def delete_object(minio_path: str) -> None:
    """Delete an object from MinIO by path."""
    filename = minio_path.split("/", 1)[1] if "/" in minio_path else minio_path
    try:
        client.remove_object(bucket_name, filename)
    except Exception as e:
        print(f"⚠️ Failed to delete from MinIO: {e}")
