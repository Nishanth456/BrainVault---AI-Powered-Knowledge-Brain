import os

PAGES = {
    "youtube": {
        "title": "YouTube Library",
        "subtitle": "Saved videos and playlists — transcribed, chapter-summarised, and indexed for semantic search.",
        "icon": "PlayCircle",
        "icon_color": "text-red-400",
        "icon_bg": "bg-red-500/15",
        "emptyIcon": "PlayCircle",
        "emptyTitle": "No videos found",
        "emptyDescription": "You haven't saved any YouTube videos yet, or none match your filters.",
        "emptyHint": "Paste a YouTube link in the dashboard to add one.",
        "fetchItems": "api/knowledge/youtube",
        "card": "VideoCard",
        "card_import": 'import { VideoCard, type VideoItem } from "@/components/knowledge/VideoCard"',
        "item_type": "VideoItem"
    },
    "linkedin": {
        "title": "LinkedIn Network",
        "subtitle": "Saved posts, articles, and profiles — analysed for insights and embedded for semantic retrieval.",
        "icon": "Linkedin",
        "icon_color": "text-blue-400",
        "icon_bg": "bg-blue-500/15",
        "emptyIcon": "Linkedin",
        "emptyTitle": "No posts found",
        "emptyDescription": "You haven't saved any LinkedIn content yet.",
        "emptyHint": "Paste a LinkedIn URL in the dashboard to add one.",
        "fetchItems": "api/knowledge/linkedin",
        "card": "LinkedInCard",
        "card_import": 'import { LinkedInCard, type LinkedInItem } from "@/components/knowledge/LinkedInCard"',
        "item_type": "LinkedInItem"
    },
    "github": {
        "title": "GitHub Repositories",
        "subtitle": "Saved repos — with architecture summaries, tech stack extraction, and semantic search.",
        "icon": "Github",
        "icon_color": "text-zinc-300",
        "icon_bg": "bg-white/10",
        "emptyIcon": "Github",
        "emptyTitle": "No repositories found",
        "emptyDescription": "You haven't saved any GitHub repositories yet.",
        "emptyHint": "Paste a GitHub repo URL in the dashboard to add one.",
        "fetchItems": "api/knowledge/github",
        "card": "RepoCard",
        "card_import": 'import { RepoCard, type RepoItem } from "@/components/knowledge/RepoCard"',
        "item_type": "RepoItem"
    },
    "blogs": {
        "title": "Blog Articles",
        "subtitle": "Saved articles — distilled, summarised, and indexed.",
        "icon": "BookOpen",
        "icon_color": "text-orange-400",
        "icon_bg": "bg-orange-500/15",
        "emptyIcon": "BookOpen",
        "emptyTitle": "No articles found",
        "emptyDescription": "You haven't saved any blogs yet.",
        "emptyHint": "Paste an article URL in the dashboard.",
        "fetchItems": "api/knowledge/blogs",
        "card": "BlogCard",
        "card_import": 'import { BlogCard, type BlogItem } from "@/components/knowledge/BlogCard"',
        "item_type": "BlogItem"
    },
    "papers": {
        "title": "Research Papers",
        "subtitle": "Saved papers and PDFs — with key concepts and citations extracted.",
        "icon": "GraduationCap",
        "icon_color": "text-violet-400",
        "icon_bg": "bg-violet-500/15",
        "emptyIcon": "GraduationCap",
        "emptyTitle": "No papers found",
        "emptyDescription": "You haven't saved any research papers yet.",
        "emptyHint": "Paste an Arxiv or PDF URL in the dashboard.",
        "fetchItems": "api/knowledge/papers",
        "card": "PaperCard",
        "card_import": 'import { PaperCard, type PaperItem } from "@/components/knowledge/PaperCard"',
        "item_type": "PaperItem"
    },
    "notes": {
        "title": "Notes & Text",
        "subtitle": "Saved notes — automatically tagged and categorised.",
        "icon": "FileText",
        "icon_color": "text-yellow-400",
        "icon_bg": "bg-yellow-500/15",
        "emptyIcon": "FileText",
        "emptyTitle": "No notes found",
        "emptyDescription": "You haven't saved any text notes yet.",
        "emptyHint": "Paste some text in the dashboard.",
        "fetchItems": "api/knowledge/notes",
        "card": "NoteCard",
        "card_import": 'import { NoteCard, type NoteItem } from "@/components/knowledge/NoteCard"',
        "item_type": "NoteItem"
    },
    "interviews": {
        "title": "Interview Q&A",
        "subtitle": "Saved interview questions and discussions.",
        "icon": "MessageSquare",
        "icon_color": "text-emerald-400",
        "icon_bg": "bg-emerald-500/15",
        "emptyIcon": "MessageSquare",
        "emptyTitle": "No Q&A found",
        "emptyDescription": "You haven't saved any interview questions yet.",
        "emptyHint": "Paste Q&A text in the dashboard.",
        "fetchItems": "api/knowledge/interview",
        "card": "QnACard",
        "card_import": 'import { QnACard, type QnAItem } from "@/components/knowledge/QnACard"',
        "item_type": "QnAItem"
    }
}

TEMPLATE = """"use client"
import {{ KnowledgePageShell }} from "@/components/knowledge/KnowledgePageShell"
{card_import}
import {{ {icon} }} from "lucide-react"

export default function {capitalized}Page() {{
  const fetchItems = async (filters: Record<string, string>, sort: string) => {{
    const params = new URLSearchParams(filters)
    params.set("sort", sort)
    const res = await fetch(`http://localhost:8000/{fetch_url}?${{params.toString()}}`)
    if (!res.ok) throw new Error("Failed to fetch")
    const data = await res.json()
    return Array.isArray(data) ? data : (data.items || [])
  }}

  return (
    <KnowledgePageShell<{item_type}>
      title="{title}"
      subtitle="{subtitle}"
      icon={{
        <div className="w-8 h-8 rounded-xl {icon_bg} flex items-center justify-center">
          <{icon} size={{16}} className="{icon_color}" />
        </div>
      }}
      emptyIcon={{<{icon} size={{24}} className="text-muted-foreground/50" />}}
      emptyTitle="{emptyTitle}"
      emptyDescription="{emptyDescription}"
      emptyHint="{emptyHint}"
      fetchItems={{fetchItems}}
      renderCard={{(item, onDelete) => <{card} key={{item.id}} item={{item}} onDelete={{onDelete}} />}}
      getItemId={{(item) => item.id}}
      filterOptions={{{{ domains: ["Engineering", "Data Science", "Design", "Management", "General"] }}}}
    />
  )
}}
"""

def main():
    for key, data in PAGES.items():
        # Special case, NoteCard is not correct for notes/page.tsx, it was NoteListItem but NoteCard works too.
        # Let's write the file
        file_path = f"frontend/app/knowledge/{key}/page.tsx"
        if os.path.exists(file_path):
            content = TEMPLATE.format(
                capitalized=key.capitalize(),
                card_import=data["card_import"],
                icon=data["icon"],
                fetch_url=data["fetchItems"],
                item_type=data["item_type"],
                title=data["title"],
                subtitle=data["subtitle"],
                icon_bg=data["icon_bg"],
                icon_color=data["icon_color"],
                emptyTitle=data["emptyTitle"],
                emptyDescription=data["emptyDescription"],
                emptyHint=data["emptyHint"],
                card=data["card"]
            )
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)

if __name__ == "__main__":
    main()
