"use client"
import { useState, useEffect, FormEvent } from "react"
import {
  AlertTriangle, BookOpen, BookPlus, CheckCircle2, ChevronRight,
  Circle, ExternalLink, Map, Plus, RefreshCw, Save, Sparkles, Trash2, X
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import type { Metadata } from "next"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PathStageItem {
  id: string
  title: string
  type: string
  difficulty: number
  knowledge_tree: string
  summary: string
}

export interface PathStage {
  title: string
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert"
  concept_summary: string
  item_ids: string[]
  items: PathStageItem[]
}

export interface LearningPath {
  id?: string
  topic: string
  name?: string
  stages: PathStage[]
  gaps: string[]
  total_items: number
  completed_stages?: string[]
  created_at?: string
}

type Tab = "generate" | "saved"

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "LangGraph agents",
  "RAG systems",
  "System Design",
  "Python async",
  "LLM fine-tuning",
  "Transformer architecture",
]

const LEVEL_COLORS: Record<string, string> = {
  Beginner:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  Intermediate: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Advanced:     "bg-violet-500/15 text-violet-400 border-violet-500/20",
  Expert:       "bg-orange-500/15 text-orange-400 border-orange-500/20",
}

const TYPE_ICONS: Record<string, string> = {
  linkedin:      "💼",
  blog:          "📰",
  research:      "🔬",
  note:          "📝",
  github:        "🐙",
  youtube:       "▶️",
  youtube_video: "▶️",
  interview_qna: "💼",
}

const TYPE_LABELS: Record<string, string> = {
  linkedin:      "LinkedIn",
  blog:          "Blog",
  research:      "Paper",
  note:          "Note",
  github:        "GitHub",
  youtube:       "YouTube",
  youtube_video: "YouTube",
  interview_qna: "Interview Q",
}

const TYPE_COLORS: Record<string, string> = {
  linkedin:      "bg-blue-500/15 text-blue-400",
  blog:          "bg-orange-500/15 text-orange-400",
  research:      "bg-violet-500/15 text-violet-400",
  note:          "bg-zinc-500/15 text-zinc-400",
  github:        "bg-zinc-500/15 text-zinc-300",
  youtube:       "bg-red-500/15 text-red-400",
  youtube_video: "bg-red-500/15 text-red-400",
  interview_qna: "bg-yellow-500/15 text-yellow-400",
}

function typeToRoute(type: string, id: string): string {
  // Only route to [id] pages that actually exist in the app.
  // linkedin → in-app PDF reader, papers → in-app PDF reader, youtube → detail page
  // Everything else → its list/space page (no individual detail pages implemented yet)
  const routes: Record<string, string> = {
    linkedin:      `/knowledge/linkedin/${id}/reader`,
    blog:          `/knowledge/blogs#item-${id}`,
    research:      `/knowledge/papers/${id}/reader`,
    note:          `/knowledge/notes#item-${id}`,
    github:        `/knowledge/github#item-${id}`,
    youtube:       `/knowledge/youtube/${id}`,
    youtube_video: `/knowledge/youtube/${id}`,
    interview_qna: `/knowledge/interviews#item-${id}`,
  }
  return routes[type] || `/knowledge/notes#item-${id}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PathGeneratorForm({ onGenerate, loading }: { onGenerate: (t: string) => void; loading: boolean }) {
  const [topic, setTopic] = useState("")
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (topic.trim()) onGenerate(topic.trim())
  }
  return (
    <div className="p-6 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
      <form onSubmit={handleSubmit} className="flex gap-3">
        <div className="flex-1 relative">
          <Sparkles size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
          <input
            id="learning-path-topic-input"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={loading}
            placeholder="What do you want to learn? e.g. 'teach me LangGraph'"
            className="w-full pl-10 pr-4 py-2.5 bg-white/[0.06] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 text-sm disabled:opacity-50 transition-colors"
          />
        </div>
        <Button
          type="submit"
          disabled={loading || !topic.trim()}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 shrink-0"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </span>
          ) : (
            <span className="flex items-center gap-2"><Sparkles size={14} /> Generate</span>
          )}
        </Button>
      </form>

      {/* Quick suggestion chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => setTopic(s)}
            disabled={loading}
            className="text-xs px-3 py-1 bg-white/[0.04] border border-white/[0.06] rounded-full text-zinc-400 hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function GapWarning({ gaps }: { gaps: string[] }) {
  if (!gaps?.length) return null
  return (
    <div className="p-4 bg-amber-500/[0.07] border border-amber-500/20 rounded-2xl">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-300 mb-1">Knowledge Gaps Detected</p>
          <p className="text-xs text-amber-400/70 mb-2">
            These important subtopics are missing from your saved content:
          </p>
          <div className="flex flex-wrap gap-2">
            {gaps.map(gap => (
              <span key={gap} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-300">
                <BookPlus size={11} />{gap}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ContentItemPanel({ stage, onClose }: { stage: PathStage | null; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  if (!stage) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Centered square modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-[#18181b] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">

          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-white/[0.07] flex-shrink-0">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                  stage.level === "Beginner"     ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                  stage.level === "Intermediate" ? "bg-blue-500/15 text-blue-400 border-blue-500/20" :
                  stage.level === "Advanced"     ? "bg-violet-500/15 text-violet-400 border-violet-500/20" :
                                                   "bg-orange-500/15 text-orange-400 border-orange-500/20"
                }`}>{stage.level}</span>
                <span className="text-xs text-zinc-500">{stage.items.length} {stage.items.length === 1 ? "item" : "items"}</span>
              </div>
              <h2 className="text-white font-semibold text-base">{stage.title}</h2>
              {stage.concept_summary && (
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{stage.concept_summary}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-1.5 text-zinc-500 hover:text-white hover:bg-white/[0.06] rounded-lg transition-all flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Item list — scrollable */}
          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {stage.items.map(item => (
              <Link
                key={item.id}
                href={typeToRoute(item.type, item.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 p-3.5 bg-white/[0.03] border border-white/[0.07] rounded-xl hover:bg-white/[0.07] hover:border-white/[0.13] transition-all group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[item.type] || "bg-zinc-500/15 text-zinc-400"}`}>
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className="text-xs text-zinc-600">Difficulty {item.difficulty}/5</span>
                  </div>
                  <h3 className="text-sm font-medium text-white line-clamp-1">{item.title}</h3>
                  {item.summary && (
                    <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{item.summary}</p>
                  )}
                </div>
                <ExternalLink size={13} className="text-zinc-600 group-hover:text-zinc-400 flex-shrink-0 mt-1" />
              </Link>
            ))}
          </div>

        </div>
      </div>
    </>
  )
}

function RoadmapNode({ stage, index, completed, onToggle, onViewItems }: {
  stage: PathStage
  index: number
  completed: boolean
  onToggle: () => void
  onViewItems: () => void
}) {
  const levelColor = LEVEL_COLORS[stage.level] || LEVEL_COLORS.Intermediate
  return (
    <div className="flex gap-4 group">
      {/* Circle toggle */}
      <div className="flex flex-col items-center flex-shrink-0">
        <button
          onClick={onToggle}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all z-10 relative"
          title={completed ? "Mark incomplete" : "Mark complete"}
        >
          {completed
            ? <CheckCircle2 size={20} className="text-emerald-400" />
            : <Circle size={20} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
          }
        </button>
      </div>

      {/* Stage card */}
      <div
        onClick={onViewItems}
        className={`flex-1 mb-6 p-4 rounded-2xl border transition-all cursor-pointer ${
          completed
            ? "bg-emerald-500/[0.05] border-emerald-500/20 opacity-75"
            : "bg-white/[0.03] border-white/[0.07] hover:bg-white/[0.05] hover:border-white/[0.12]"
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-zinc-500 font-mono">Stage {index + 1}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${levelColor}`}>
                {stage.level}
              </span>
            </div>
            <h3 className={`font-semibold text-sm ${completed ? "text-zinc-500 line-through" : "text-white"}`}>
              {stage.title}
            </h3>
          </div>
          <ChevronRight size={16} className="text-zinc-600 flex-shrink-0 mt-1" />
        </div>
        <p className="text-xs text-zinc-500 mb-3 leading-relaxed">{stage.concept_summary}</p>
        <div className="flex items-center gap-2">
          {[...new Set(stage.items.map(i => i.type))].slice(0, 4).map(type => (
            <span key={type} className="text-sm" title={type}>{TYPE_ICONS[type] || "📄"}</span>
          ))}
          <span className="text-xs text-zinc-500 flex items-center gap-1">
            <BookOpen size={11} />
            {stage.items.length} {stage.items.length === 1 ? "item" : "items"}
          </span>
        </div>
      </div>
    </div>
  )
}

function LearningRoadmap({ stages, completedStages, onToggleStage }: {
  stages: PathStage[]
  completedStages: string[]
  onToggleStage: (t: string) => void
}) {
  const [openStage, setOpenStage] = useState<PathStage | null>(null)
  return (
    <>
      <div className="relative">
        {/* Vertical connector line */}
        <div className="absolute left-[19px] top-10 bottom-10 w-0.5 bg-gradient-to-b from-emerald-500/30 via-white/[0.06] to-transparent pointer-events-none" />
        <div className="space-y-2">
          {stages.map((stage, index) => (
            <RoadmapNode
              key={stage.title}
              stage={stage}
              index={index}
              completed={completedStages.includes(stage.title)}
              onToggle={() => onToggleStage(stage.title)}
              onViewItems={() => setOpenStage(stage)}
            />
          ))}
        </div>
      </div>
      <ContentItemPanel stage={openStage} onClose={() => setOpenStage(null)} />
    </>
  )
}

function SavedPathCard({ path, onDelete, onOpen }: {
  path: LearningPath
  onDelete: () => void
  onOpen: () => void
}) {
  const hasGaps = (path.gaps?.length || 0) > 0
  const date = path.created_at
    ? new Date(path.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : ""
  return (
    <div
      onClick={onOpen}
      className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.07] rounded-2xl hover:bg-white/[0.05] hover:border-white/[0.12] transition-all group cursor-pointer"
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
          <Map size={15} className="text-emerald-400" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{path.name || path.topic}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-500">{date}</span>
            {hasGaps && (
              <span className="text-xs text-amber-400/70">
                · {path.gaps?.length} gap{path.gaps!.length > 1 ? "s" : ""}
              </span>
            )}
            <span className="text-xs text-zinc-600">· {path.total_items} items</span>
          </div>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onDelete() }}
        className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
        title="Delete path"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

function RoadmapSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-white/[0.06]" />
            {i < 3 && <div className="w-0.5 h-16 bg-white/[0.04] mt-2" />}
          </div>
          <div className="flex-1 pb-8">
            <div className="h-5 w-48 bg-white/[0.06] rounded mb-2" />
            <div className="h-4 w-72 bg-white/[0.04] rounded mb-3" />
            <div className="flex gap-2">
              <div className="h-8 w-32 bg-white/[0.03] rounded-xl" />
              <div className="h-8 w-32 bg-white/[0.03] rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LearningPage() {
  const [tab, setTab] = useState<Tab>("generate")
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentPath, setCurrentPath] = useState<LearningPath | null>(null)
  const [savedPaths, setSavedPaths] = useState<LearningPath[]>([])
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [pathName, setPathName] = useState("")
  const [completedStages, setCompletedStages] = useState<string[]>([])

  const fetchSaved = () => {
    setLoadingSaved(true)
    fetch("http://localhost:8000/api/learning-path")
      .then(r => r.json())
      .then(data => setSavedPaths(Array.isArray(data) ? data : []))
      .catch(() => setSavedPaths([]))
      .finally(() => setLoadingSaved(false))
  }

  useEffect(() => {
    if (tab === "saved") fetchSaved()
  }, [tab])

  const handleGenerate = async (topic: string) => {
    setGenerating(true)
    setCurrentPath(null)
    setCompletedStages([])
    try {
      const res = await fetch("http://localhost:8000/api/learning-path/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      })
      const data = await res.json()
      setCurrentPath(data)
      setPathName(`My ${topic} Journey`)
    } catch (e) {
      console.error("Generate failed:", e)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!currentPath) return
    setSaving(true)
    try {
      await fetch("http://localhost:8000/api/learning-path/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: currentPath.topic,
          name: pathName || `Learning Path: ${currentPath.topic}`,
          stages: currentPath.stages,
          gaps: currentPath.gaps,
          total_items: currentPath.total_items,
        }),
      })
      fetchSaved()
      setTab("saved")
    } catch (e) {
      console.error("Save failed:", e)
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStage = async (title: string) => {
    const next = completedStages.includes(title) 
      ? completedStages.filter(t => t !== title) 
      : [...completedStages, title];
      
    setCompletedStages(next);

    if (currentPath?.id) {
      try {
        await fetch(`http://localhost:8000/api/learning-path/${currentPath.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed_stages: next }),
        });
      } catch (e) {
        console.error("Failed to save progress:", e);
      }
    }
  }

  const handleDeleteSaved = async (id: string) => {
    await fetch(`http://localhost:8000/api/learning-path/${id}`, { method: "DELETE" })
    setSavedPaths(prev => prev.filter(p => p.id !== id))
  }

  const progressPct = currentPath?.stages.length
    ? Math.round((completedStages.length / currentPath.stages.length) * 100)
    : 0

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-4xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <Map size={16} className="text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Learning Paths</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              AI-generated progressive study roadmaps built entirely from your saved knowledge.
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 mb-8 p-1 bg-white/[0.04] rounded-xl border border-white/[0.06] w-fit">
          {(["generate", "saved"] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                tab === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t === "generate"
                ? <span className="flex items-center gap-1.5"><Sparkles size={13} /> Generate</span>
                : <span className="flex items-center gap-1.5"><BookOpen size={13} /> Saved Paths</span>
              }
            </button>
          ))}
        </div>

        {/* ── Generate tab ─────────────────────────────────────────────────── */}
        {tab === "generate" && (
          <div className="space-y-8">
            <PathGeneratorForm onGenerate={handleGenerate} loading={generating} />

            {generating && <RoadmapSkeleton />}

            {!generating && currentPath && (
              <>
                {/* Progress + save bar */}
                <div className="flex items-center justify-between gap-4 p-4 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-zinc-400 font-medium">Progress</span>
                      <span className="text-xs text-zinc-500">
                        {completedStages.length}/{currentPath.stages.length} stages
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      id="path-name-input"
                      value={pathName}
                      onChange={e => setPathName(e.target.value)}
                      placeholder="Name this path..."
                      className="text-sm bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 w-52"
                    />
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white h-8"
                    >
                      <Save size={13} className="mr-1.5" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>

                {currentPath.gaps.length > 0 && <GapWarning gaps={currentPath.gaps} />}

                <LearningRoadmap
                  stages={currentPath.stages}
                  completedStages={completedStages}
                  onToggleStage={handleToggleStage}
                />
              </>
            )}

            {!generating && !currentPath && (
              <EmptyState
                icon={<Map size={28} className="text-emerald-400" />}
                title="Generate a learning path"
                description="Type a topic above and BrainVault will build a personalized progressive roadmap using only what you've saved."
                hint="Example: 'teach me LangGraph', 'RAG systems', 'system design'"
              />
            )}
          </div>
        )}

        {/* ── Saved tab ────────────────────────────────────────────────────── */}
        {tab === "saved" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm text-zinc-500">
                {savedPaths.length} saved {savedPaths.length === 1 ? "path" : "paths"}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchSaved}
                className="border-white/10 text-zinc-400 hover:text-white h-8"
              >
                <RefreshCw size={13} className="mr-1.5" /> Refresh
              </Button>
            </div>

            {loadingSaved && (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-24 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                ))}
              </div>
            )}

            {!loadingSaved && savedPaths.length === 0 && (
              <EmptyState
                icon={<BookOpen size={28} className="text-zinc-500" />}
                title="No saved paths yet"
                description="Generate a learning path and save it to build your personal study collection."
                action={
                  <Button
                    variant="outline"
                    onClick={() => setTab("generate")}
                    className="border-white/10 text-zinc-400 hover:text-white"
                  >
                    <Plus size={14} className="mr-2" /> Generate a Path
                  </Button>
                }
              />
            )}

            {!loadingSaved && savedPaths.length > 0 && (
              <div className="space-y-3">
                {savedPaths.map(path => (
                  <SavedPathCard
                    key={path.id}
                    path={path}
                    onDelete={() => path.id && handleDeleteSaved(path.id)}
                    onOpen={() => {
                      fetch(`http://localhost:8000/api/learning-path/${path.id}`)
                        .then(r => r.json())
                        .then(data => {
                          setCurrentPath(data)
                          setPathName(data.name || "")
                          setCompletedStages(data.completed_stages || [])
                          setTab("generate")
                        })
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
