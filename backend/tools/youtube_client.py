"""
youtube_client.py — Fetch metadata, transcripts, and thumbnails from YouTube URLs.

Supports:
- https://www.youtube.com/watch?v=VIDEO_ID
- https://youtu.be/VIDEO_ID
- https://www.youtube.com/playlist?list=PLAYLIST_ID
- https://www.youtube.com/watch?v=VIDEO_ID&list=PLAYLIST_ID

Uses yt-dlp for metadata + thumbnails and youtube-transcript-api for captions.
"""
import asyncio
import re
import tempfile
from urllib.parse import parse_qs, urlparse

from backend.services.minio import upload_bytes


def _extract_video_id(url: str) -> str | None:
    parsed = urlparse(url)
    if parsed.hostname in ("youtu.be", "www.youtu.be", "youtu.be."):
        return parsed.path.lstrip("/").split("/")[0] or None
    if parsed.hostname in ("youtube.com", "www.youtube.com", "m.youtube.com"):
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
    return None


def _extract_playlist_id(url: str) -> str | None:
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "list" in qs:
        return qs["list"][0]
    return None


def _format_duration(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def _run_yt_dlp_info(url: str, extract_flat: bool = False) -> dict:
    """Run yt-dlp in a thread to extract video/playlist metadata."""
    import yt_dlp

    ydl_opts = {
        "quiet": True,
        "skip_download": True,
        "writesubtitles": False,
        "writeautomaticsub": False,
        "extract_flat": extract_flat,
        "ignoreerrors": True,          # Keep going when a playlist entry is unavailable
        "no_warnings": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(url, download=False)


def _run_yt_dlp_playlist_info(url: str) -> dict:
    """Fast playlist extraction: only IDs, titles, and durations."""
    return _run_yt_dlp_info(url, extract_flat=True)


async def fetch_video_metadata(url: str) -> dict:
    """Fetch metadata for a single YouTube video."""
    info = await asyncio.to_thread(_run_yt_dlp_info, url)
    if not info:
        raise ValueError("yt-dlp returned no video metadata")
    video_id = info.get("id") or _extract_video_id(url)
    chapters = info.get("chapters") or []

    return {
        "video_id": video_id,
        "title": info.get("title", "Untitled Video"),
        "channel": info.get("channel", "Unknown Channel"),
        "channel_id": info.get("channel_id"),
        "duration_seconds": info.get("duration") or 0,
        "duration_text": _format_duration(info.get("duration") or 0),
        "description": info.get("description", ""),
        "thumbnail_url": info.get("thumbnail"),
        "upload_date": info.get("upload_date", ""),
        "view_count": info.get("view_count") or 0,
        "tags": info.get("tags") or [],
        "categories": info.get("categories") or [],
        "chapters": [
            {
                "title": ch.get("title", ""),
                "start_seconds": ch.get("start_time", 0),
                "start_text": _format_duration(int(ch.get("start_time", 0))),
            }
            for ch in chapters
        ],
        "source_url": f"https://www.youtube.com/watch?v={video_id}" if video_id else url,
    }


async def fetch_transcript(video_id: str, languages: list[str] | None = None) -> list[dict]:
    """
    Fetch transcript/captions for a video using youtube-transcript-api.
    Returns list of {text, start, duration} entries.
    """
    from youtube_transcript_api import YouTubeTranscriptApi

    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=languages or ["en"])
        return [
            {
                "text": entry.get("text", ""),
                "start_seconds": entry.get("start", 0),
                "duration_seconds": entry.get("duration", 0),
            }
            for entry in transcript_list
        ]
    except Exception as e:
        print(f"⚠️ Transcript fetch failed for {video_id}: {e}")
        return []


async def download_thumbnail(thumbnail_url: str, video_id: str) -> str | None:
    """Download thumbnail and upload to MinIO. Returns MinIO path or None."""
    if not thumbnail_url:
        return None
    try:
        import httpx
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(thumbnail_url)
            resp.raise_for_status()
            data = resp.content

        filename = f"thumbnails/youtube/{video_id}.jpg"
        minio_path = upload_bytes(filename, data, content_type="image/jpeg")
        return minio_path
    except Exception as e:
        print(f"⚠️ Thumbnail download failed: {e}")
        return None


async def resolve_youtube_video(url: str) -> dict:
    """Resolve a single YouTube video URL into full metadata + transcript."""
    metadata = await fetch_video_metadata(url)
    video_id = metadata.get("video_id")
    transcript = await fetch_transcript(video_id) if video_id else []
    thumbnail_path = await download_thumbnail(metadata.get("thumbnail_url"), video_id) if video_id else None

    return {
        "type": "youtube_video",
        "video_id": video_id,
        "metadata": metadata,
        "transcript": transcript,
        "thumbnail_path": thumbnail_path,
    }


def _pick_best_thumbnail(thumbnails: list[dict] | None) -> str | None:
    """Return the highest-resolution thumbnail URL from a yt-dlp thumbnails list."""
    if not thumbnails:
        return None
    best = None
    best_pixels = 0
    for thumb in thumbnails:
        url = thumb.get("url")
        if not url:
            continue
        width = thumb.get("width") or 0
        height = thumb.get("height") or 0
        pixels = width * height
        if pixels > best_pixels:
            best_pixels = pixels
            best = url
    return best


async def resolve_youtube_playlist(url: str) -> dict:
    """Resolve a YouTube playlist URL into playlist metadata only.

    We intentionally do not enumerate or store individual videos — the user wants
    the playlist saved as a single redirect item. We still fetch and store the
    playlist thumbnail so the UI has a real image to display.
    """
    info = await asyncio.to_thread(_run_yt_dlp_playlist_info, url)
    if not info:
        raise ValueError("yt-dlp returned no playlist metadata")

    playlist_id = _extract_playlist_id(url) or info.get("id")
    entries = info.get("entries") or []

    # Count resolvable entries but do not build a video list
    video_count = 0
    for entry in entries[:50]:
        if not entry:
            continue
        if isinstance(entry, str):
            video_count += 1
            continue
        title = entry.get("title", "")
        if title in ("[Private video]", "[Deleted video]") or entry.get("availability") == "private":
            continue
        if entry.get("id"):
            video_count += 1

    # Download the best available playlist thumbnail to MinIO
    thumbnail_url = _pick_best_thumbnail(info.get("thumbnails"))
    thumbnail_path = None
    if thumbnail_url and playlist_id:
        thumbnail_path = await download_thumbnail(thumbnail_url, f"playlist/{playlist_id}")

    return {
        "type": "youtube_playlist",
        "playlist_id": playlist_id,
        "title": info.get("title", "Untitled Playlist"),
        "channel": info.get("channel", "Unknown Channel"),
        "description": info.get("description", ""),
        "video_count": video_count,
        "videos": [],
        "thumbnail_path": thumbnail_path,
        "source_url": url,
    }


async def resolve_youtube_url(url: str) -> dict:
    """Resolve any YouTube URL into video or playlist data."""
    playlist_id = _extract_playlist_id(url)
    video_id = _extract_video_id(url)

    if playlist_id and not video_id:
        return await resolve_youtube_playlist(url)

    # If both video and playlist present, treat as video but keep playlist_id
    result = await resolve_youtube_video(url)
    if playlist_id:
        result["playlist_id"] = playlist_id
    return result


async def debug_resolve(url: str) -> dict:
    """Debug helper: return raw yt-dlp output for a URL."""
    return await asyncio.to_thread(_run_yt_dlp_info, url)


def extract_video_id(url: str) -> str | None:
    """Public wrapper: extract the video ID from any YouTube URL."""
    return _extract_video_id(url)
