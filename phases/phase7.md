# 🐙 Phase 7 — GitHub + YouTube Agents

> **Prerequisite**: Phase 6 complete — AI Chat (RAG) works, chat history persists, and the "Ask AI" panel in the LinkedIn reader is wired up.
>
> **Goal**: Save GitHub repos and YouTube videos/playlists. GitHub shows as a repo card with architecture summary. YouTube shows with transcript and chapter summaries.
> **UI Rule**: Every new knowledge space must have a beautiful card grid, empty state, filter bar, and detail view. Reuse the existing design language.

---

## ✅ What You Ship at the End of Phase 7

```
GitHub:
1. Paste https://github.com/langchain-ai/langgraph into the universal input
2. Agent detects GitHub repo URL, calls GitHub REST API
3. Fetches metadata, README, top-level file tree
4. LLM infers tech stack, summarizes README, extracts architecture
5. Repo card appears in /knowledge/github
6. Card shows: name, description, AI summary, tech stack chips, stars, language, last updated
7. Click card → detail view with "What is this for?" and architecture overview
8. "Open on GitHub" button links to the real repo

YouTube:
1. Paste a YouTube video URL about RAG into the universal input
2. Agent detects YouTube URL, fetches metadata with yt-dlp
3. youtube-transcript-api pulls captions
4. LLM summarizes per chapter and overall
5. Video card appears in /knowledge/youtube
6. Card shows: thumbnail, title, channel, duration, difficulty, key concepts
7. Click card → detail view with chapter breakdown + searchable transcript
8. Click a chapter → jumps to that section in the transcript
9. Playlist URLs create a playlist record + linked video records (up to 50 videos)
```

---

## 📁 New Files to Create / Update

```
backend/
├── agents/
│   ├── github_agent.py         ← NEW: GitHub LangGraph subgraph
│   ├── youtube_agent.py        ← NEW: YouTube LangGraph subgraph
│   └── orchestrator.py         ← UPDATE: route github/youtube URLs to new agents
├── tools/
│   ├── github_client.py        ← NEW: GitHub REST API wrapper
│   ├── youtube_client.py       ← NEW: yt-dlp + transcript wrapper
│   └── minio_uploader.py       ← UPDATE: support image/thumbnail uploads
├── routers/
│   ├── knowledge.py            ← UPDATE: add github/youtube list/detail endpoints
│   └── files.py                ← UPDATE: serve thumbnail images from MinIO
├── models/
│   └── schemas.py              ← UPDATE: add github_repo + youtube_video + youtube_playlist types
├── services/
│   ├── embedding.py            ← UPDATE: embed repo/video summaries
│   └── storage_service.py      ← UPDATE: store new type payloads
└── main.py                     ← UPDATE: register new routers if any

frontend/
├── app/knowledge/github/page.tsx       ← NEW: GitHub repos grid page
├── app/knowledge/youtube/page.tsx      ← NEW: YouTube videos grid page
├── app/knowledge/youtube/[id]/page.tsx ← NEW: YouTube video detail page
├── components/knowledge/
│   ├── RepoCard.tsx            ← NEW: GitHub repo card
│   ├── RepoDetail.tsx          ← NEW: repo architecture + tech stack view
│   ├── VideoCard.tsx           ← NEW: YouTube video card
│   ├── VideoDetail.tsx         ← NEW: chapters + transcript view
│   └── PlaylistCard.tsx        ← NEW: playlist summary card
├── components/dashboard/
│   └── UniversalInput.tsx      ← UPDATE: detect github/youtube URLs
├── lib/api.ts                  ← UPDATE: add github/youtube API helpers
└── app/layout.tsx              ← UPDATE: ensure /knowledge/github and /knowledge/youtube nav links active
```

---

## 🐍 Backend Implementation

### 1. Database — Add New Knowledge Types

Update `backend/models/schemas.py` KnowledgeItem type enum and payload fields:

```python
class KnowledgeItemType(str, Enum):
    linkedin = "linkedin"
    blog = "blog"
    research_paper = "research_paper"
    note = "note"
    interview_qna = "interview_qna"
    github_repo = "github_repo"
    youtube_video = "youtube_video"
    youtube_playlist = "youtube_playlist"

# Add optional columns for github/youtube specific metadata
class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    # ... existing columns ...

    # GitHub-specific
    repo_stars: Mapped[int | None]
    repo_language: Mapped[str | None]
    repo_owner: Mapped[str | None]
    repo_name: Mapped[str | None]
    tech_stack: Mapped[list[str] | None] = mapped_column(ARRAY(Text))
    architecture_summary: Mapped[str | None] = mapped_column(Text)
    use_case_summary: Mapped[str | None] = mapped_column(Text)

    # YouTube-specific
    video_duration_seconds: Mapped[int | None]
    channel_name: Mapped[str | None]
    thumbnail_path: Mapped[str | None]  # MinIO path
    chapters: Mapped[list[dict] | None] = mapped_column(JSON)  # [{title, start_seconds, summary}]
    transcript: Mapped[list[dict] | None] = mapped_column(JSON)  # [{text, start, duration}]
    playlist_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_items.id"), nullable=True)
```

Run Alembic migration or create tables manually.

### 2. `backend/tools/github_client.py` — GitHub REST API Wrapper

```python
import os
import base64
import httpx
from typing import Any

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")  # optional, raises rate limit

async def fetch_repo_metadata(owner: str, repo: str) -> dict[str, Any]:
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=headers)
        resp.raise_for_status()
        return resp.json()

async def fetch_readme(owner: str, repo: str) -> str:
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/readme",
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
        content = base64.b64decode(data["content"]).decode("utf-8", errors="replace")
        return content

async def fetch_repo_tree(owner: str, repo: str, depth: int = 1) -> list[dict[str, Any]]:
    headers = {"Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {GITHUB_TOKEN}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/git/trees/HEAD?recursive={depth}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json().get("tree", [])
```

### 3. `backend/agents/github_agent.py` — GitHub LangGraph Subgraph

```python
from typing import TypedDict
from langgraph.graph import StateGraph, END
from backend.tools.github_client import fetch_repo_metadata, fetch_readme, fetch_repo_tree
from backend.services.llm import call_llm_json
from backend.services.embedding import generate_embedding
from backend.services.qdrant import upsert_knowledge
from backend.services.storage_service import create_knowledge_item

class GitHubState(TypedDict):
    url: str
    owner: str
    repo: str
    metadata: dict
    readme: str
    tree: list
    tech_stack: list
    summary: str
    architecture: str
    use_case: str
    knowledge_item_id: str

async def parse_github_url(state: GitHubState) -> GitHubState:
    # Extract owner/repo from https://github.com/{owner}/{repo}/...
    parts = state["url"].replace("https://github.com/", "").split("/")
    state["owner"] = parts[0]
    state["repo"] = parts[1]
    return state

async def fetch_repo(state: GitHubState) -> GitHubState:
    state["metadata"] = await fetch_repo_metadata(state["owner"], state["repo"])
    return state

async def fetch_readme_node(state: GitHubState) -> GitHubState:
    try:
        state["readme"] = await fetch_readme(state["owner"], state["repo"])
    except Exception:
        state["readme"] = ""
    return state

async def fetch_tree_node(state: GitHubState) -> GitHubState:
    state["tree"] = await fetch_repo_tree(state["owner"], state["repo"], depth=1)
    return state

async def analyze_repo(state: GitHubState) -> GitHubState:
    metadata = state["metadata"]
    tree = state["tree"]
    readme = state["readme"][:12000]

    tree_files = [t["path"] for t in tree[:50]]
    prompt = f"""
You are analyzing a GitHub repository. Given the metadata, README, and top-level file tree, produce a JSON object with:
- tech_stack: list of technologies/frameworks used (e.g. Python, TypeScript, React, FastAPI)
- summary: 3-5 sentence description of what this repo does
- architecture: 3-5 sentence overview of how the project is structured and its main components
- use_case: 2-3 sentence description of who this is for and when to use it
- knowledge_tree: a hierarchical path like "AI > LLMs > Agents > LangGraph" where this repo belongs
- difficulty: 1-5
- key_concepts: list of 5-10 technical concepts

Repo: {metadata.get("full_name")}
Description: {metadata.get("description")}
Language: {metadata.get("language")}
Stars: {metadata.get("stargazers_count")}

Top files:
{chr(10).join(tree_files)}

README:
{readme}
"""
    result = await call_llm_json(prompt)
    state["tech_stack"] = result.get("tech_stack", [])
    state["summary"] = result.get("summary", "")
    state["architecture"] = result.get("architecture", "")
    state["use_case"] = result.get("use_case", "")
    state["knowledge_tree"] = result.get("knowledge_tree", "AI")
    state["difficulty"] = result.get("difficulty", 3)
    state["key_concepts"] = result.get("key_concepts", [])
    return state

async def store_repo(state: GitHubState) -> GitHubState:
    metadata = state["metadata"]
    embedding_text = " ".join([
        state["summary"],
        state["use_case"],
        " ".join(state["tech_stack"]),
        " ".join(state["key_concepts"]),
    ])
    embedding = await generate_embedding(embedding_text)

    item = await create_knowledge_item(
        type="github_repo",
        title=metadata.get("full_name"),
        source_url=state["url"],
        summary=state["summary"],
        knowledge_tree=state["knowledge_tree"],
        difficulty=state["difficulty"],
        key_concepts=state["key_concepts"],
        repo_stars=metadata.get("stargazers_count"),
        repo_language=metadata.get("language"),
        repo_owner=state["owner"],
        repo_name=state["repo"],
        tech_stack=state["tech_stack"],
        architecture_summary=state["architecture"],
        use_case_summary=state["use_case"],
    )
    state["knowledge_item_id"] = str(item.id)

    await upsert_knowledge(
        id=str(item.id),
        vector=embedding,
        payload={
            "type": "github_repo",
            "title": metadata.get("full_name"),
            "summary": state["summary"],
            "knowledge_tree": state["knowledge_tree"],
            "difficulty": state["difficulty"],
            "key_concepts": state["key_concepts"],
            "repo_language": metadata.get("language"),
            "tech_stack": state["tech_stack"],
        },
    )
    return state

graph = StateGraph(GitHubState)
graph.add_node("parse", parse_github_url)
graph.add_node("fetch_repo", fetch_repo)
graph.add_node("fetch_readme", fetch_readme_node)
graph.add_node("fetch_tree", fetch_tree_node)
graph.add_node("analyze", analyze_repo)
graph.add_node("store", store_repo)
graph.set_entry_point("parse")
graph.add_edge("parse", "fetch_repo")
graph.add_edge("fetch_repo", "fetch_readme")
graph.add_edge("fetch_readme", "fetch_tree")
graph.add_edge("fetch_tree", "analyze")
graph.add_edge("analyze", "store")
graph.add_edge("store", END)

github_agent = graph.compile()
```

### 4. `backend/tools/youtube_client.py` — YouTube Metadata + Transcript

```python
import os
import re
import subprocess
import tempfile
from typing import Any
from youtube_transcript_api import YouTubeTranscriptApi

YOUTUBE_COOKIES = os.getenv("YOUTUBE_COOKIES")  # optional path to cookies.txt

def extract_video_id(url: str) -> str:
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
        r"embed\/([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract video ID from {url}")

def is_playlist_url(url: str) -> bool:
    return "list=" in url

def extract_playlist_id(url: str) -> str:
    match = re.search(r"[?&]list=([A-Za-z0-9_-]+)", url)
    if not match:
        raise ValueError(f"Could not extract playlist ID from {url}")
    return match.group(1)

def fetch_video_metadata(video_id: str) -> dict[str, Any]:
    cmd = [
        "yt-dlp",
        "--dump-json",
        "--no-download",
        f"https://www.youtube.com/watch?v={video_id}",
    ]
    if YOUTUBE_COOKIES:
        cmd.extend(["--cookies", YOUTUBE_COOKIES])

    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    import json
    return json.loads(result.stdout)

def fetch_playlist_video_ids(playlist_id: str) -> list[str]:
    cmd = [
        "yt-dlp",
        "--flat-playlist",
        "--print", "id",
        f"https://www.youtube.com/playlist?list={playlist_id}",
    ]
    if YOUTUBE_COOKIES:
        cmd.extend(["--cookies", YOUTUBE_COOKIES])

    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return [line.strip() for line in result.stdout.strip().split("\n") if line.strip()][:50]

def fetch_transcript(video_id: str) -> list[dict[str, Any]]:
    try:
        return YouTubeTranscriptApi.get_transcript(video_id)
    except Exception:
        return []

def download_thumbnail(url: str, output_path: str) -> None:
    import httpx
    with httpx.Client() as client:
        resp = client.get(url)
        resp.raise_for_status()
        with open(output_path, "wb") as f:
            f.write(resp.content)
```

### 5. `backend/agents/youtube_agent.py` — YouTube LangGraph Subgraph

```python
from typing import TypedDict
from langgraph.graph import StateGraph, END
from backend.tools.youtube_client import (
    extract_video_id,
    is_playlist_url,
    extract_playlist_id,
    fetch_video_metadata,
    fetch_playlist_video_ids,
    fetch_transcript,
    download_thumbnail,
)
from backend.services.llm import call_llm_json
from backend.services.embedding import generate_embedding
from backend.services.qdrant import upsert_knowledge
from backend.services.storage_service import create_knowledge_item
from backend.tools.minio_uploader import upload_file
import os
import tempfile

class YouTubeState(TypedDict):
    url: str
    is_playlist: bool
    video_id: str
    playlist_id: str
    metadata: dict
    transcript: list
    chapters: list
    overall_summary: str
    key_concepts: list
    difficulty: int
    knowledge_tree: str
    thumbnail_path: str
    knowledge_item_id: str
    playlist_video_ids: list

async def detect_type(state: YouTubeState) -> YouTubeState:
    state["is_playlist"] = is_playlist_url(state["url"])
    if state["is_playlist"]:
        state["playlist_id"] = extract_playlist_id(state["url"])
    else:
        state["video_id"] = extract_video_id(state["url"])
    return state

async def fetch_metadata(state: YouTubeState) -> YouTubeState:
    if state["is_playlist"]:
        state["playlist_video_ids"] = fetch_playlist_video_ids(state["playlist_id"])
        # For playlist metadata, fetch first video as representative
        state["metadata"] = fetch_video_metadata(state["playlist_video_ids"][0])
    else:
        state["metadata"] = fetch_video_metadata(state["video_id"])
    return state

async def fetch_transcript_node(state: YouTubeState) -> YouTubeState:
    if state["is_playlist"]:
        state["transcript"] = []
        return state
    state["transcript"] = fetch_transcript(state["video_id"])
    return state

async def download_thumbnail_node(state: YouTubeState) -> YouTubeState:
    meta = state["metadata"]
    thumbnail_url = meta.get("thumbnail", [None])[-1] if isinstance(meta.get("thumbnail"), list) else meta.get("thumbnail")
    if not thumbnail_url:
        state["thumbnail_path"] = None
        return state

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        download_thumbnail(thumbnail_url, tmp.name)
        minio_path = await upload_file(tmp.name, f"thumbnails/{meta['id']}.jpg")
        state["thumbnail_path"] = minio_path
        os.unlink(tmp.name)
    return state

async def analyze_video(state: YouTubeState) -> YouTubeState:
    meta = state["metadata"]
    transcript_text = " ".join([t["text"] for t in state["transcript"]])[:15000]
    chapters = meta.get("chapters", [])

    prompt = f"""
You are analyzing a YouTube video. Given the title, channel, description, and transcript, produce a JSON object with:
- overall_summary: 5-sentence summary
- key_concepts: list of 5-10 technical concepts covered
- difficulty: 1-5
- knowledge_tree: hierarchical path like "AI > LLMs > RAG"
- chapters: list of {{title, start_seconds, summary}} for each chapter (if no chapters, create 3-5 logical sections)

Title: {meta.get('title')}
Channel: {meta.get('channel')}
Duration: {meta.get('duration')} seconds
Description: {meta.get('description', '')[:2000]}

Transcript:
{transcript_text}
"""
    result = await call_llm_json(prompt)
    state["overall_summary"] = result.get("overall_summary", "")
    state["key_concepts"] = result.get("key_concepts", [])
    state["difficulty"] = result.get("difficulty", 3)
    state["knowledge_tree"] = result.get("knowledge_tree", "AI")
    state["chapters"] = result.get("chapters", [])
    return state

async def store_video(state: YouTubeState) -> YouTubeState:
    meta = state["metadata"]
    embedding_text = " ".join([
        state["overall_summary"],
        " ".join(state["key_concepts"]),
        meta.get("title", ""),
        meta.get("channel", ""),
    ])
    embedding = await generate_embedding(embedding_text)

    item = await create_knowledge_item(
        type="youtube_video",
        title=meta.get("title"),
        source_url=state["url"],
        summary=state["overall_summary"],
        knowledge_tree=state["knowledge_tree"],
        difficulty=state["difficulty"],
        key_concepts=state["key_concepts"],
        video_duration_seconds=meta.get("duration"),
        channel_name=meta.get("channel"),
        thumbnail_path=state["thumbnail_path"],
        chapters=state["chapters"],
        transcript=state["transcript"],
    )
    state["knowledge_item_id"] = str(item.id)

    await upsert_knowledge(
        id=str(item.id),
        vector=embedding,
        payload={
            "type": "youtube_video",
            "title": meta.get("title"),
            "summary": state["overall_summary"],
            "knowledge_tree": state["knowledge_tree"],
            "difficulty": state["difficulty"],
            "key_concepts": state["key_concepts"],
            "channel_name": meta.get("channel"),
            "thumbnail_path": state["thumbnail_path"],
        },
    )
    return state

graph = StateGraph(YouTubeState)
graph.add_node("detect", detect_type)
graph.add_node("fetch_metadata", fetch_metadata)
graph.add_node("fetch_transcript", fetch_transcript_node)
graph.add_node("download_thumbnail", download_thumbnail_node)
graph.add_node("analyze", analyze_video)
graph.add_node("store", store_video)
graph.set_entry_point("detect")
graph.add_edge("detect", "fetch_metadata")
graph.add_edge("fetch_metadata", "fetch_transcript")
graph.add_edge("fetch_metadata", "download_thumbnail")
graph.add_edge("fetch_transcript", "analyze")
graph.add_edge("download_thumbnail", "analyze")
graph.add_edge("analyze", "store")
graph.add_edge("store", END)

youtube_video_agent = graph.compile()
```

### 6. Playlist Handling

For playlist URLs, run the video agent for each video ID, then create a parent playlist item:

```python
async def process_playlist(url: str) -> str:
    playlist_id = extract_playlist_id(url)
    video_ids = fetch_playlist_video_ids(playlist_id)

    video_item_ids = []
    for vid in video_ids:
        try:
            state = await youtube_video_agent.ainvoke({
                "url": f"https://www.youtube.com/watch?v={vid}&list={playlist_id}",
                "is_playlist": False,
                "video_id": vid,
            })
            video_item_ids.append(state["knowledge_item_id"])
        except Exception as e:
            print(f"Failed to process playlist video {vid}: {e}")

    # Create playlist-level summary item
    summaries = []
    for vid_id in video_item_ids:
        item = await get_knowledge_item(vid_id)
        summaries.append(item.summary)

    combined = "\n\n".join(summaries)
    prompt = f"Summarize this YouTube playlist in 5 sentences and list 5-10 key concepts covered across all videos:\n\n{combined[:12000]}"
    result = await call_llm_json(prompt)

    embedding = await generate_embedding(result.get("summary", "") + " " + " ".join(result.get("key_concepts", [])))
    playlist_item = await create_knowledge_item(
        type="youtube_playlist",
        title=f"Playlist: {playlist_id}",
        source_url=url,
        summary=result.get("summary", ""),
        knowledge_tree=result.get("knowledge_tree", "AI"),
        difficulty=result.get("difficulty", 3),
        key_concepts=result.get("key_concepts", []),
    )

    # Link videos to playlist
    for vid_id in video_item_ids:
        await link_to_playlist(vid_id, playlist_item.id)

    await upsert_knowledge(
        id=str(playlist_item.id),
        vector=embedding,
        payload={...},
    )
    return str(playlist_item.id)
```

### 7. Orchestrator Routing

Update `backend/agents/orchestrator.py` to detect GitHub and YouTube URLs:

```python
import re

def detect_input_type(raw_input: str) -> str:
    raw = raw_input.strip()
    if re.search(r"github\.com/[^/]+/[^/]+", raw):
        return "github_repo"
    if re.search(r"youtube\.com/watch|youtu\.be/|youtube\.com/playlist", raw):
        return "youtube"
    # ... existing detectors ...
    return "note"

async def run_agent(input_type: str, raw_input: str, job_id: str):
    if input_type == "github_repo":
        await github_agent.ainvoke({"url": raw_input})
    elif input_type == "youtube":
        if "playlist" in raw_input:
            await process_playlist(raw_input)
        else:
            await youtube_video_agent.ainvoke({"url": raw_input})
    # ... existing agents ...
```

### 8. API Endpoints

Update `backend/routers/knowledge.py`:

```python
@router.get("/api/knowledge/github")
async def list_github_repos():
    # return github_repo items ordered by created_at desc

@router.get("/api/knowledge/youtube")
async def list_youtube_videos():
    # return youtube_video items ordered by created_at desc

@router.get("/api/knowledge/{id}")
async def get_knowledge_item_detail(id: str):
    # return full item including transcript/chapters/architecture
```

---

## ⚛️ Frontend Implementation

### 1. `frontend/app/knowledge/github/page.tsx`

```tsx
"use client"
import { useEffect, useState } from "react"
import { RepoCard } from "@/components/knowledge/RepoCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { getGitHubRepos } from "@/lib/api"

export default function GitHubPage() {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getGitHubRepos().then(setRepos).finally(() => setLoading(false))
  }, [])

  if (!loading && repos.length === 0) {
    return <EmptyState title="No GitHub repos yet" description="Paste a GitHub repo URL to see it here." />
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">GitHub Repos</h1>
          <p className="text-zinc-500 text-sm">Repos you've saved with AI-generated architecture summaries.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {repos.map((repo) => <RepoCard key={repo.id} repo={repo} />)}
        </div>
      </div>
    </div>
  )
}
```

### 2. `frontend/components/knowledge/RepoCard.tsx`

```tsx
"use client"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Star, Code2, ExternalLink } from "lucide-react"
import Link from "next/link"

export function RepoCard({ repo }: { repo: any }) {
  return (
    <Link href={`/knowledge/github/${repo.id}`}>
      <Card className="p-5 h-full hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-semibold text-white">{repo.title}</h3>
          <ExternalLink size={14} className="text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-400 line-clamp-3 mb-4">{repo.summary}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {repo.tech_stack?.map((tech: string) => (
            <Badge key={tech} variant="secondary" className="text-xs">{tech}</Badge>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Star size={12} /> {repo.repo_stars ?? 0}</span>
          <span className="flex items-center gap-1"><Code2 size={12} /> {repo.repo_language ?? "Unknown"}</span>
        </div>
      </Card>
    </Link>
  )
}
```

### 3. `frontend/app/knowledge/youtube/page.tsx`

```tsx
"use client"
import { useEffect, useState } from "react"
import { VideoCard } from "@/components/knowledge/VideoCard"
import { EmptyState } from "@/components/ui/EmptyState"
import { getYouTubeVideos } from "@/lib/api"

export default function YouTubePage() {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getYouTubeVideos().then(setVideos).finally(() => setLoading(false))
  }, [])

  if (!loading && videos.length === 0) {
    return <EmptyState title="No YouTube videos yet" description="Paste a YouTube video or playlist URL to see it here." />
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">YouTube Library</h1>
          <p className="text-zinc-500 text-sm">Saved videos with chapter summaries and searchable transcripts.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => <VideoCard key={video.id} video={video} />)}
        </div>
      </div>
    </div>
  )
}
```

### 4. `frontend/components/knowledge/VideoCard.tsx`

```tsx
"use client"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, PlayCircle } from "lucide-react"
import Link from "next/link"

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VideoCard({ video }: { video: any }) {
  return (
    <Link href={`/knowledge/youtube/${video.id}`}>
      <Card className="overflow-hidden h-full hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="aspect-video bg-zinc-800 relative">
          {video.thumbnail_path ? (
            <img src={`/api/files/${video.thumbnail_path}`} alt={video.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"><PlayCircle size={32} className="text-zinc-500" /></div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-white line-clamp-2 mb-1">{video.title}</h3>
          <p className="text-xs text-zinc-500 mb-2">{video.channel_name}</p>
          <p className="text-sm text-zinc-400 line-clamp-2 mb-3">{video.summary}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={12} /> {formatDuration(video.video_duration_seconds)}</span>
            <Badge variant="secondary" className="text-xs">Difficulty {video.difficulty}</Badge>
          </div>
        </div>
      </Card>
    </Link>
  )
}
```

### 5. `frontend/app/knowledge/youtube/[id]/page.tsx`

```tsx
"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { getKnowledgeItem } from "@/lib/api"
import { VideoDetail } from "@/components/knowledge/VideoDetail"

export default function YouTubeDetailPage() {
  const { id } = useParams()
  const [video, setVideo] = useState<any>(null)

  useEffect(() => {
    getKnowledgeItem(id as string).then(setVideo)
  }, [id])

  if (!video) return <div className="p-8 text-zinc-500">Loading...</div>

  return <VideoDetail video={video} />
}
```

### 6. `frontend/components/knowledge/VideoDetail.tsx`

```tsx
"use client"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function VideoDetail({ video }: { video: any }) {
  const [query, setQuery] = useState("")

  const filteredTranscript = video.transcript?.filter((t: any) =>
    t.text.toLowerCase().includes(query.toLowerCase())
  ) || []

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <div className="aspect-video bg-zinc-800 rounded-xl mb-6 flex items-center justify-center">
        {video.thumbnail_path ? (
          <img src={`/api/files/${video.thumbnail_path}`} alt={video.title} className="w-full h-full object-cover rounded-xl" />
        ) : (
          <span className="text-zinc-500">No thumbnail</span>
        )}
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">{video.title}</h1>
      <p className="text-zinc-400 mb-4">{video.channel_name} • Difficulty {video.difficulty}</p>
      <p className="text-zinc-300 mb-6">{video.summary}</p>

      <div className="flex flex-wrap gap-2 mb-8">
        {video.key_concepts?.map((c: string) => <Badge key={c} variant="secondary">{c}</Badge>)}
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Chapters</h2>
      <div className="space-y-2 mb-8">
        {video.chapters?.map((chapter: any, idx: number) => (
          <div key={idx} className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.08]">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-white">{chapter.title}</span>
              <span className="text-xs text-zinc-500">{formatTime(chapter.start_seconds)}</span>
            </div>
            <p className="text-sm text-zinc-400">{chapter.summary}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-white mb-3">Transcript</h2>
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search transcript..."
          className="pl-10 bg-white/[0.03] border-white/[0.08]"
        />
      </div>
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
        {(query ? filteredTranscript : video.transcript)?.map((t: any, idx: number) => (
          <div key={idx} className="flex gap-3 text-sm">
            <span className="text-zinc-500 shrink-0 w-12">{formatTime(t.start)}</span>
            <span className="text-zinc-300">{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### 7. `frontend/lib/api.ts`

```ts
export async function getGitHubRepos() {
  const res = await fetch(`${API_BASE}/api/knowledge/github`)
  if (!res.ok) throw new Error("Failed to load GitHub repos")
  return res.json()
}

export async function getYouTubeVideos() {
  const res = await fetch(`${API_BASE}/api/knowledge/youtube`)
  if (!res.ok) throw new Error("Failed to load YouTube videos")
  return res.json()
}

export async function getKnowledgeItem(id: string) {
  const res = await fetch(`${API_BASE}/api/knowledge/${id}`)
  if (!res.ok) throw new Error("Failed to load knowledge item")
  return res.json()
}
```

---

## ✅ Testing Checklist

```
GitHub
- [ ] Paste https://github.com/langchain-ai/langgraph into universal input
- [ ] Agent detects github_repo type
- [ ] Metadata, README, and tree fetched successfully
- [ ] LLM produces tech_stack, summary, architecture, use_case
- [ ] Repo card appears in /knowledge/github
- [ ] Card shows stars, language, tech stack chips
- [ ] Click card → detail view shows architecture and use case
- [ ] "Open on GitHub" button works
- [ ] Repo appears in semantic search results

YouTube
- [ ] Paste a single YouTube video URL into universal input
- [ ] Agent detects youtube type
- [ ] yt-dlp fetches metadata and thumbnail
- [ ] youtube-transcript-api pulls transcript
- [ ] LLM produces summary, chapters, key concepts
- [ ] Video card appears in /knowledge/youtube with thumbnail
- [ ] Click card → detail view shows chapters and transcript
- [ ] Search transcript filters correctly
- [ ] Click chapter timestamp scrolls/jumps to transcript section
- [ ] Paste a YouTube playlist URL
- [ ] Each video processed and stored
- [ ] Playlist card appears with aggregate summary
- [ ] Playlist detail shows linked videos

Integration
- [ ] New items are searchable in Brain Search
- [ ] New items can be cited in Brain Talk
- [ ] No existing Phase 1-6 functionality broken
- [ ] next build passes
- [ ] Backend starts without errors
```

---

## 🚀 Next Steps After Phase 7

Phase 8 will add the Interview Question Agent + Q&A Bank, cross-detecting interview questions from all saved content types.
