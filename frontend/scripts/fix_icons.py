import os

def replace_in_file(path, old, new):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    with open(path, "w", encoding="utf-8") as f:
        f.write(content.replace(old, new))

replace_in_file("frontend/app/knowledge/github/page.tsx", "import { Github }", "import { GitBranch }")
replace_in_file("frontend/app/knowledge/github/page.tsx", "<Github ", "<GitBranch ")
replace_in_file("frontend/app/knowledge/linkedin/page.tsx", "import { Linkedin }", "import { Link2 }")
replace_in_file("frontend/app/knowledge/linkedin/page.tsx", "<Linkedin ", "<Link2 ")
