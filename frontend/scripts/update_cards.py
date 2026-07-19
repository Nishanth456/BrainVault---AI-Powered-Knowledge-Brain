import os
import re

def main():
    base_dir = "frontend/components/knowledge"
    for file in os.listdir(base_dir):
        if file.endswith("Card.tsx") or file == "NoteListItem.tsx":
            path = os.path.join(base_dir, file)
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()

            # 1. Update interface to include is_bookmarked?: boolean
            # Usually interfaces end with `}`. We can find `id: string` and inject `is_bookmarked?: boolean`
            if "is_bookmarked?: boolean" not in content:
                content = re.sub(r'(id: string)', r'\1\n  is_bookmarked?: boolean', content)

            # 2. Add imports if needed
            if "BookmarkButton" not in content:
                content = re.sub(
                    r'(import .* from "lucide-react")',
                    r'\1\nimport { BookmarkButton } from "@/components/knowledge/BookmarkButton"\nimport { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"\nimport { restoreItem } from "@/lib/api"',
                    content
                )

            # 3. Replace the delete button section
            # The delete button is usually something like:
            # <button onClick={handleDelete} ...> ... </button>
            # Let's find it.
            delete_button_pattern = re.compile(
                r'(<button[^>]*onClick=\{handleDelete\}[^>]*>.*?</button>)', re.DOTALL
            )
            
            replacement = """<div className="flex items-center gap-2">
            <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
            <DeleteWithUndo
              itemId={item.id}
              itemTitle={item.title || ""}
              onDelete={onDelete!}
              onUndo={async (id) => {
                await restoreItem(id)
                // TODO: trigger a refetch if needed, for now we just rely on page refresh or local state if passed down
              }}
            />
          </div>"""

            new_content = delete_button_pattern.sub(replacement, content)
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)

if __name__ == "__main__":
    main()
