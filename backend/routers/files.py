"""
files.py — Serve files from MinIO storage.
Frontend reads PDF bytes directly from this endpoint — the MinIO internal URL
is never exposed to the browser.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.services.minio import get_bytes
import io

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{file_path:path}")
async def serve_file(file_path: str):
    """
    Serve any file stored in MinIO.

    Frontend passes the minio_path (e.g. 'brainvault-files/linkedin_abc.pdf').
    Returns raw bytes — PDFs render inline in the browser via react-pdf.
    Images (carousel slides) are served as image/jpeg.
    """
    try:
        file_bytes = get_bytes(file_path)
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"File not found: {e}")

    # Determine content type from extension
    lower = file_path.lower()
    if lower.endswith(".pdf"):
        content_type = "application/pdf"
    elif lower.endswith((".jpg", ".jpeg")):
        content_type = "image/jpeg"
    elif lower.endswith(".png"):
        content_type = "image/png"
    else:
        content_type = "application/octet-stream"

    return StreamingResponse(
        content=io.BytesIO(file_bytes),
        media_type=content_type,
        headers={
            "Content-Disposition": "inline",              # Render in browser, not download
            "Cache-Control":       "private, max-age=3600",
            "Content-Length":      str(len(file_bytes)),
            "Access-Control-Allow-Origin": "*",           # Allow react-pdf to load cross-origin
        }
    )
