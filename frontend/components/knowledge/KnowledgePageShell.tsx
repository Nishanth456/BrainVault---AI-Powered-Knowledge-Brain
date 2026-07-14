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

        {!loading && items.length === 0 && (
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDescription}
            hint={emptyHint}
            action={{ label: "Paste a link", href: "/" }}
          />
        )}

        {!loading && items.length > 0 && (
          <StaggeredCardGrid singleColumn={singleColumn}>
            {items.map(item => renderCard(item, handleDelete))}
          </StaggeredCardGrid>
        )}
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
