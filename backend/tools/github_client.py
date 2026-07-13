"""
github_client.py — Fetch metadata, README, and repo structure from GitHub URLs.

Supports:
- https://github.com/owner/repo
- https://github.com/owner/repo/tree/branch
- https://github.com/owner/repo/blob/branch/path

Uses the public GitHub REST API (no auth = 60 req/hr; auth = 5000 req/hr).
"""
import base64
import httpx
import re
from urllib.parse import urlparse

from backend.config import settings


GITHUB_API_BASE = "https://api.github.com"
GITHUB_REPO_RE = re.compile(r"^/([^/]+)/([^/]+)(?:/|$)")


def _extract_owner_repo(url: str) -> tuple[str, str] | None:
    # Ensure the URL has a scheme so urlparse works reliably
    normalized = url.strip()
    if not normalized.startswith(("http://", "https://")):
        normalized = f"https://{normalized}"

    parsed = urlparse(normalized)
    if "github.com" not in parsed.netloc.lower():
        return None
    match = GITHUB_REPO_RE.search(parsed.path)
    if not match:
        return None
    owner, repo = match.group(1), match.group(2)
    # Strip .git if present
    repo = repo.removesuffix(".git")
    return owner, repo


def _github_headers() -> dict:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "BrainVault-GitHub-Agent",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = getattr(settings, "GITHUB_TOKEN", None)
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def fetch_repo_metadata(owner: str, repo: str) -> dict:
    """Fetch repository metadata from GitHub REST API."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_github_headers())
        resp.raise_for_status()
        data = resp.json()

    return {
        "owner": owner,
        "repo": repo,
        "name": data.get("name", repo),
        "full_name": data.get("full_name", f"{owner}/{repo}"),
        "description": data.get("description") or "",
        "stars": data.get("stargazers_count") or 0,
        "forks": data.get("forks_count") or 0,
        "language": data.get("language") or "",
        "topics": data.get("topics") or [],
        "license": (data.get("license") or {}).get("name", ""),
        "default_branch": data.get("default_branch", "main"),
        "created_at": data.get("created_at", ""),
        "updated_at": data.get("updated_at", ""),
        "html_url": data.get("html_url", f"https://github.com/{owner}/{repo}"),
        "source_url": f"https://github.com/{owner}/{repo}",
    }


async def fetch_readme(owner: str, repo: str, default_branch: str | None = None) -> str:
    """Fetch and decode README.md content. Falls back to empty string."""
    # Try README.md first, then readme.md
    for readme_name in ["README.md", "readme.md", "README.MD"]:
        url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{readme_name}"
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url, headers=_github_headers())
            if resp.status_code == 200:
                data = resp.json()
                content = data.get("content", "")
                encoding = data.get("encoding", "base64")
                if encoding == "base64" and content:
                    try:
                        return base64.b64decode(content).decode("utf-8", errors="replace")
                    except Exception:
                        return ""
                return content
    return ""


async def fetch_repo_structure(owner: str, repo: str, default_branch: str | None = None, depth: int = 1) -> list[dict]:
    """
    Fetch top-level repo tree. Returns list of file/dir entries.
    depth=1 means only top-level; increase to recurse (capped at 2).
    """
    branch = default_branch or "main"
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/git/trees/{branch}?recursive={max(0, min(depth, 2))}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_github_headers())
        resp.raise_for_status()
        data = resp.json()

    tree = data.get("tree", [])
    # Keep only top-level if depth=1
    if depth == 1:
        tree = [item for item in tree if "/" not in item.get("path", "")]

    return [
        {
            "path": item.get("path"),
            "type": item.get("type"),  # blob | tree
            "size": item.get("size"),
        }
        for item in tree
    ]


async def fetch_file_content(owner: str, repo: str, path: str) -> str:
    """Fetch raw content of a file in the repo."""
    url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/{path}"
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers=_github_headers())
        resp.raise_for_status()
        data = resp.json()
        content = data.get("content", "")
        encoding = data.get("encoding", "base64")
        if encoding == "base64" and content:
            try:
                return base64.b64decode(content).decode("utf-8", errors="replace")
            except Exception:
                return ""
        return content


async def resolve_github_url(url: str) -> dict:
    """
    Resolve a GitHub URL into a full repo profile.
    Returns dict with metadata, readme, structure, and key files.
    """
    owner_repo = _extract_owner_repo(url)
    if not owner_repo:
        raise ValueError(f"Invalid GitHub repository URL: {url}")

    owner, repo = owner_repo
    metadata = await fetch_repo_metadata(owner, repo)
    readme = await fetch_readme(owner, repo, metadata.get("default_branch"))
    structure = await fetch_repo_structure(owner, repo, metadata.get("default_branch"), depth=1)

    # Try to fetch key dependency/config files for tech stack detection
    key_files = {}
    candidates = [
        "package.json",
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "Cargo.toml",
        "go.mod",
        "build.gradle",
        "pom.xml",
        "Gemfile",
        "composer.json",
        "Dockerfile",
        "docker-compose.yml",
        "next.config.ts",
        "next.config.js",
        "tsconfig.json",
    ]
    for path in candidates:
        try:
            key_files[path] = await fetch_file_content(owner, repo, path)
        except Exception:
            key_files[path] = None

    return {
        "owner": owner,
        "repo": repo,
        "metadata": metadata,
        "readme": readme,
        "structure": structure,
        "key_files": {k: v for k, v in key_files.items() if v},
    }
