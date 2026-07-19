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
            # Find the interface block
            interface_match = re.search(r'export interface \w+Item \{', content)
            if interface_match and "is_bookmarked?: boolean" not in content:
                insert_pos = interface_match.end()
                content = content[:insert_pos] + "\n  is_bookmarked?: boolean" + content[insert_pos:]

            # 2. Add imports if needed
            imports_to_add = []
            if "BookmarkButton" not in content:
                imports_to_add.append('import { BookmarkButton } from "@/components/knowledge/BookmarkButton"')
            if "DeleteWithUndo" not in content:
                imports_to_add.append('import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"')
            if "restoreItem" not in content:
                imports_to_add.append('import { restoreItem } from "@/lib/api"')
            if "ExportButton" not in content:
                imports_to_add.append('import { ExportButton } from "@/components/knowledge/ExportButton"')
                
            if imports_to_add:
                content = re.sub(
                    r'(import .* from "lucide-react")',
                    r'\1\n' + '\n'.join(imports_to_add),
                    content
                )

            # 3. Replace the delete button section
            # The delete button usually looks like:
            # <button
            #   onClick={(e) => { ... handleDelete() ... }}
            #   ...
            # </button>
            # OR <button onClick={handleDelete} ... > ... </button>
            delete_button_pattern = re.compile(
                r'(<button[^>]*onClick=\{[^}]*(handleDelete)[^}]*\}[^>]*>.*?</button>)', re.DOTALL
            )
            
            replacement = """<div className="flex items-center gap-2">
              <BookmarkButton itemId={item.id} initial={item.is_bookmarked || false} />
              <ExportButton itemId={item.id} title={item.title || "Export"} />
              <DeleteWithUndo
                itemId={item.id}
                itemTitle={item.title || ""}
                onDelete={onDelete!}
                onUndo={async (id) => {
                  await restoreItem(id)
                }}
              />
            </div>"""

            new_content = delete_button_pattern.sub(replacement, content)
            
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)

if __name__ == "__main__":
    main()
