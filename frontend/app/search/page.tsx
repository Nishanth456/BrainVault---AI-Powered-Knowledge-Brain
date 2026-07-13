"use client"
import { SearchFilters } from "@/components/search/SearchFilters"
import { SearchResultCard } from "@/components/search/SearchResultCard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/EmptyState"
import { Input } from "@/components/ui/input"
import { searchKnowledge, type SearchFilters as SearchFiltersType, type SearchResultItem } from "@/lib/api"
import { Filter, Loader2, Search, X } from "lucide-react"
import { useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"

const TYPE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  blog: "Blogs",
  research: "Research Papers",
  research_paper: "Research Papers",
  note: "Notes",
  interview_qna: "Interview Q&A",
}

const TYPE_ORDER = ["linkedin", "blog", "research", "research_paper", "note", "interview_qna"]

export default function SearchPage() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""

  const [query, setQuery] = useState(initialQuery)
  const [inputValue, setInputValue] = useState(initialQuery)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [grouped, setGrouped] = useState<Record<string, SearchResultItem[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [filters, setFilters] = useState<SearchFiltersType>({})
  const [showFilters, setShowFilters] = useState(false)

  const performSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setGrouped({})
      return
    }
    setLoading(true)
    setError(false)
    try {
      const data = await searchKnowledge(q, filters, 20)
      setResults(data.results)
      setGrouped(data.grouped)
    } catch (e) {
      console.error(e)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (initialQuery) performSearch(initialQuery)
  }, [initialQuery, performSearch])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setQuery(inputValue)
    performSearch(inputValue)
  }

  const groupedKeys = useMemo(() => {
    return TYPE_ORDER.filter(k => grouped[k]?.length > 0)
  }, [grouped])

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/15 flex items-center justify-center">
              <Search size={16} className="text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Semantic Search</h1>
          </div>
          <p className="text-zinc-500 text-sm">
            Search across everything in your BrainVault — LinkedIn posts, blogs, papers, and notes.
          </p>
        </div>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <Input
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                placeholder="e.g. RAG evaluation techniques"
                className="pl-10 h-11 bg-white/[0.03] border-white/[0.08] text-white placeholder:text-zinc-600"
              />
              {inputValue && (
                <button
                  type="button"
                  onClick={() => { setInputValue(""); setQuery(""); setResults([]); setGrouped({}) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Button
              type="submit"
              disabled={loading || !inputValue.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white h-11 px-5"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : "Search"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFilters(p => !p)}
              className={`border-white/10 h-11 px-4 ${showFilters ? "text-indigo-300 border-indigo-500/30" : "text-zinc-400"}`}
            >
              <Filter size={16} />
            </Button>
          </div>
        </form>

        {/* Filters */}
        {showFilters && (
          <div className="mb-8 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.08]">
            <SearchFilters
              filters={filters}
              onChange={setFilters}
              onClear={() => setFilters({})}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i}>
                <div className="h-4 w-32 bg-white/[0.05] rounded-lg animate-pulse mb-4" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-64 bg-white/[0.03] rounded-2xl animate-pulse border border-white/[0.05]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="Search failed"
            description="Could not reach the BrainVault backend. Make sure it is running on port 8000."
            hint="Run: uvicorn backend.main:app --reload"
          />
        )}

        {/* Empty */}
        {!loading && !error && query && results.length === 0 && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="No results found"
            description={`Your brain has no results for "${query}" yet.`}
            hint="Try a broader query, or add some content first."
          />
        )}

        {/* Initial state */}
        {!loading && !error && !query && (
          <EmptyState
            icon={<Search size={24} className="text-indigo-400" />}
            title="Search your knowledge brain"
            description="Type a question or topic above to find relevant content across all your saved items."
            hint='Try: "RAG evaluation", "prompt engineering tips", or "LLM inference"'
          />
        )}

        {/* Grouped results */}
        {!loading && !error && results.length > 0 && (
          <div className="space-y-10">
            {groupedKeys.map(type => (
              <div key={type}>
                <div className="flex items-center gap-2.5 mb-4">
                  <h2 className="text-lg font-semibold text-white">{TYPE_LABELS[type] || type}</h2>
                  <span className="text-xs text-zinc-500">({grouped[type].length})</span>
                </div>
                <div className="flex flex-col gap-4">
                  {grouped[type].map(item => (
                    <SearchResultCard
                      key={item.id}
                      item={item}
                      onDelete={(id) => {
                        setResults(prev => prev.filter(r => r.id !== id))
                        setGrouped(prev => {
                          const next = { ...prev }
                          next[type] = next[type].filter(r => r.id !== id)
                          return next
                        })
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
