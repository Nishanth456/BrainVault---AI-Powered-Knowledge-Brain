import os

files = [
    "CertCard.tsx", "CourseCard.tsx", "LinkedInCard.tsx",
    "PaperCard.tsx", "RepoCard.tsx", "VideoCard.tsx"
]

imports = """
import { BookmarkButton } from "@/components/knowledge/BookmarkButton"
import { DeleteWithUndo } from "@/components/knowledge/DeleteWithUndo"
import { ExportButton } from "@/components/knowledge/ExportButton"
import { restoreItem } from "@/lib/api"
"""

for f in files:
    path = os.path.join("frontend/components/knowledge", f)
    with open(path, "r", encoding="utf-8") as file:
        content = file.read()
    
    if "import { BookmarkButton" not in content:
        # Insert after the first import or after "use client"
        if '} from "lucide-react"' in content:
            content = content.replace('} from "lucide-react"', '} from "lucide-react"' + imports)
        else:
            content = content.replace('"use client"', '"use client"\n' + imports)
        
        with open(path, "w", encoding="utf-8") as file:
            file.write(content)
