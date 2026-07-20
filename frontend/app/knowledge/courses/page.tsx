"use client"
import { CourseCard, type CourseItem } from "@/components/knowledge/CourseCard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { ChevronDown, ChevronRight, GraduationCap, RefreshCw } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

function groupBySection(items: CourseItem[]): Record<string, CourseItem[]> {
  const groups: Record<string, CourseItem[]> = {}
  for (const item of items) {
    const section = item.knowledge_tree || "Uncategorised"
    if (!groups[section]) groups[section] = []
    groups[section].push(item)
  }
  return groups
}

function leafTopic(treePath: string): string {
  const parts = treePath.split(">")
  return parts[parts.length - 1].trim()
}

export default function CoursesPage() {
  const [items, setItems]         = useState<CourseItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchItems = () => {
    setLoading(true)
    setError(false)
    fetch("http://127.0.0.1:8000/api/knowledge/courses")
      .then(r => {
        if (!r.ok) throw new Error("API error")
        return r.json()
      })
      .then(data => {
        setItems(Array.isArray(data) ? data : [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }

  useEffect(() => { fetchItems() }, [])

  // Auto-scroll to target if navigating with a hash (e.g. from learning paths)
  useEffect(() => {
    if (items.length > 0 && window.location.hash) {
      setTimeout(() => {
        const el = document.getElementById(window.location.hash.substring(1))
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
          el.classList.add("js-glow")
        }
      }, 100)
    }
  }, [items])

  const grouped = useMemo(() => groupBySection(items), [items])
  const sections = Object.keys(grouped).sort()

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Page header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <GraduationCap size={16} className="text-indigo-400" />
              </div>
              <h1 className="text-2xl font-bold text-white">Courses</h1>
            </div>
            <p className="text-zinc-500 text-sm">
              Your saved learning courses, parsed with syllabus and prerequisites.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {!loading && (
              <span className="text-sm text-zinc-600 hidden sm:block">
                {items.length} {items.length === 1 ? "course" : "courses"}
              </span>
            )}
            <Button
              variant="outline" size="sm"
              onClick={fetchItems}
              className="border-white/10 text-zinc-400 hover:text-white h-8"
            >
              <RefreshCw size={13} className="mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* State handling */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
            <RefreshCw size={24} className="animate-spin text-zinc-600" />
            <p className="text-sm animate-pulse">Loading your courses...</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center py-20">
            <div className="bg-red-500/10 text-red-400 px-4 py-3 rounded-xl text-sm border border-red-500/20">
              Failed to load courses. Is the backend running?
            </div>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="py-12">
            <EmptyState
              icon={<GraduationCap size={24} className="text-zinc-500" />}
              title="No courses yet"
              description="Paste a Udemy or Coursera link in the top bar to analyze and save it."
            />
          </div>
        )}

        {/* Render grouped by Knowledge Tree */}
        {!loading && !error && items.length > 0 && (
          <div className="space-y-12">
            {sections.map(section => {
              const isCollapsed = collapsed[section]
              const sectionItems = grouped[section]
              const displayTitle = section === "Uncategorised" ? section : leafTopic(section)

              return (
                <div key={section} className="space-y-4">
                  {/* Section Header */}
                  <div
                    className="flex items-center gap-3 cursor-pointer group"
                    onClick={() => toggleSection(section)}
                  >
                    <div className="text-zinc-500 group-hover:text-zinc-300 transition-colors">
                      {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                    </div>
                    <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-3">
                      {displayTitle}
                      <span className="text-xs font-medium px-2 py-0.5 bg-white/5 text-zinc-500 rounded-full border border-white/5">
                        {sectionItems.length}
                      </span>
                    </h2>
                    {section !== "Uncategorised" && (
                      <div className="hidden sm:block text-xs font-mono text-zinc-600 ml-2 mt-0.5">
                        {section}
                      </div>
                    )}
                    <div className="flex-1 h-px bg-white/[0.03] ml-4" />
                  </div>

                  {/* Section Grid */}
                  {!isCollapsed && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pl-7">
                      {sectionItems.map(item => (
                        <CourseCard
                          key={item.id}
                          item={item}
                          onDelete={(id) => {
                            setItems(prev => prev.filter(x => x.id !== id))
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
