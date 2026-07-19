import re

def update_search_page():
    path = "frontend/app/search/page.tsx"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Add imports
    if "RecentSearches" not in content:
        content = re.sub(
            r'(import .* from "lucide-react")',
            r'\1\nimport { RecentSearches } from "@/components/search/RecentSearches"',
            content
        )

    # Add state for recent searches
    if "recentSearches" not in content:
        content = content.replace(
            "const [showFilters, setShowFilters] = useState(false)",
            "const [showFilters, setShowFilters] = useState(false)\n  const [recentSearches, setRecentSearches] = useState<string[]>([])\n  useEffect(() => {\n    const saved = localStorage.getItem('recent_searches')\n    if (saved) setRecentSearches(JSON.parse(saved))\n  }, [])"
        )
        
        # Save search to local storage in performSearch
        search_save = """    setLoading(true)
    // Save recent search
    setRecentSearches(prev => {
      const next = [q, ...prev.filter(s => s !== q)].slice(0, 5)
      localStorage.setItem('recent_searches', JSON.stringify(next))
      return next
    })"""
        content = content.replace("setLoading(true)", search_save, 1)

    # Inject <RecentSearches> into the render
    if "<RecentSearches" not in content:
        render_injection = """        {/* Search form */}
        <form onSubmit={handleSubmit} className="mb-6">"""
        
        new_render = """        {/* Search form */}
        <form onSubmit={handleSubmit} className="mb-6">"""
        
        recent_jsx = """
        {!query && (
          <RecentSearches
            searches={recentSearches}
            onSelect={(s) => {
              setInputValue(s)
              setQuery(s)
              performSearch(s)
            }}
            onClear={() => {
              setRecentSearches([])
              localStorage.removeItem('recent_searches')
            }}
          />
        )}"""
        
        # Inject right after form closes
        content = content.replace("</form>", "</form>\n" + recent_jsx)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == "__main__":
    update_search_page()
