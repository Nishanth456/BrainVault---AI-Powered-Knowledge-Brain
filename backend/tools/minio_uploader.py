"""
minio_uploader.py — HTTP download + MinIO upload utility.
Downloads a file from a public URL and stores it in MinIO.
"""
import httpx
import uuid
from backend.services.minio import upload_bytes


async def download_and_store_pdf(url: str, prefix: str = "linkedin") -> dict:
    """
    Download a PDF from a URL and store it in MinIO.
    Returns a dict with storage info + raw_bytes for text extraction.
    """
    async with httpx.AsyncClient(
        timeout=60.0,
        follow_redirects=True,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; BrainVault/1.0)",
            "Accept": "application/pdf,*/*",
        }
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    pdf_bytes = response.content
    filename = f"{prefix}_{uuid.uuid4()}.pdf"

    minio_path = upload_bytes(
        filename=filename,
        data=pdf_bytes,
        content_type="application/pdf"
    )

    return {
        "filename": filename,
        "minio_path": minio_path,
        "file_type": "pdf",
        "file_size_bytes": len(pdf_bytes),
        "raw_bytes": pdf_bytes,  # Caller is responsible for removing this from state
    }


async def store_bytes_to_minio(
    data: bytes,
    filename: str,
    content_type: str = "application/octet-stream"
) -> str:
    """Store any raw bytes directly to MinIO. Returns the minio_path."""
    return upload_bytes(filename=filename, data=data, content_type=content_type)
