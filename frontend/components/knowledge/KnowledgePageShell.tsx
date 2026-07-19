"use client"
import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FilterBar } from "./FilterBar"
import { SortDropdown } from "./SortDropdown"
import { EmptyState } from "@/components/ui/EmptyState"
import { ShimmerSkeleton } from "@/components/ui/ShimmerSkeleton"
import { StaggeredCardGrid } from "./StaggeredCardGrid"

interface KnowledgePageShellProps<T> {
  title: string
  subtitle: string
  icon: React.ReactNode
  emptyIcon: React.ReactNode
  emptyTitle: string
  emptyDescription: string
  emptyHint: string
  fetchItems: (filters: Record<string, string>, sort: string) => Promise<T[]>
  renderCard: (item: T, onDelete: (id: string) => void) => React.ReactNode
  getItemId: (item: T) => string
  filterOptions?: { domains?: string[] }
  singleColumn?: boolean
  groupBy?: (item: T) => string | undefined | null
}

export function KnowledgePageShellInner<T>({
  title,
  subtitle,
  icon,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  emptyHint,
  fetchItems,
  renderCard,
  getItemId,
  filterOptions,
  singleColumn,
  groupBy = (item: T) => (item as any).knowledge_tree || "Uncategorized",
}: KnowledgePageShellProps<T>) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState("newest")

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const initialFilters: Record<string, string> = {}
    params.forEach((value, key) => {
      if (key !== "sort") initialFilters[key] = value
    })
    setFilters(initialFilters)
    setSort(params.get("sort") || "newest")
  }, [searchParams])

  useEffect(() => {
    setLoading(true)
    fetchItems(filters, sort)
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [filters, sort, fetchItems])

  useEffect(() => {
    const handleRestoreEvent = () => {
      setLoading(true)
      fetchItems(filters, sort)
        .then(setItems)
        .catch(console.error)
        .finally(() => setLoading(false))
    }
    window.addEventListener("knowledge-item-restored", handleRestoreEvent)
    return () => window.removeEventListener("knowledge-item-restored", handleRestoreEvent)
  }, [filters, sort, fetchItems])

  const updateFilters = (next: Record<string, string>) => {
    const params = new URLSearchParams()
    Object.entries(next).forEach(([k, v]) => v && params.set(k, v))
    if (sort !== "newest") params.set("sort", sort)
    router.replace(`?${params.toString()}`, { scroll: false })
    setFilters(next)
  }

  const handleDelete = (id: string) => setItems(prev => prev.filter(i => getItemId(i) !== id))

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {icon}
              <h1 className="text-2xl font-bold text-white">{title}</h1>
            </div>
            <p className="text-zinc-500 text-sm">{subtitle}</p>
          </div>
          <SortDropdown value={sort} onChange={(v) => {
            setSort(v)
            const params = new URLSearchParams(searchParams.toString())
            if (v === "newest") params.delete("sort")
            else params.set("sort", v)
            router.replace(`?${params.toString()}`, { scroll: false })
          }} />
        </div>

        <FilterBar
          filters={filters}
          onChange={updateFilters}
          domains={filterOptions?.domains}
        />

        {loading && <ShimmerSkeleton count={6} />}

        {!loading && (() => {
          const filteredItems = items.filter(item => {
            if (filters.q) {
              const q = filters.q.toLowerCase()
              const title = (item as any).title?.toLowerCase() || ""
              const summary = (item as any).summary?.toLowerCase() || ""
              const concepts = (item as any).key_concepts?.join(" ").toLowerCase() || ""
              if (!title.includes(q) && !summary.includes(q) && !concepts.includes(q)) return false
            }
            return true
          })

          if (filteredItems.length === 0) {
            return (
              <EmptyState
                icon={emptyIcon}
                title={emptyTitle}
                description={filters.q ? "No items match your search filter." : emptyDescription}
                hint={filters.q ? "Try adjusting your search keywords." : emptyHint}
                action={filters.q ? { label: "Clear search", href: "", onClick: (e) => { e.preventDefault(); const next = {...filters}; delete next.q; updateFilters(next) } } : { label: "Paste a link", href: "/" }}
              />
            )
          }

          const grouped = filteredItems.reduce((acc, item) => {
            const key = groupBy(item) || "Uncategorized"
            if (!acc[key]) acc[key] = []
            acc[key].push(item)
            return acc
          }, {} as Record<string, T[]>)

          return (
            <div className="space-y-12">
              {Object.entries(grouped).map(([group, groupItems]) => (
                <div key={group}>
                  <div className="flex items-center gap-2 mb-4">
                    <h2 className="text-lg font-semibold text-white/90">{group}</h2>
                    <span className="text-xs text-white/20 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">{groupItems.length}</span>
                  </div>
                  <StaggeredCardGrid singleColumn={singleColumn}>
                    {groupItems.map(item => renderCard(item, handleDelete))}
                  </StaggeredCardGrid>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

export function KnowledgePageShell<T>(props: KnowledgePageShellProps<T>) {
  return (
    <Suspense fallback={<div className="p-6 sm:p-8"><ShimmerSkeleton count={3} /></div>}>
      <KnowledgePageShellInner {...props} />
    </Suspense>
  )
}
