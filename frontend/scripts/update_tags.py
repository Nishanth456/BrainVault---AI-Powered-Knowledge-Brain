import glob, re

files = glob.glob('c:/Users/nisha/Projects/BrainVault/frontend/components/knowledge/*Card.tsx') + ['c:/Users/nisha/Projects/BrainVault/frontend/components/knowledge/NoteListItem.tsx']

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # 1. Replace the wrapper div class for tags
    new_content = content.replace('className="flex flex-wrap gap-1.5"', 'className="flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden pb-0.5"')
    
    # 2. Add whitespace-nowrap flex-shrink-0 to the tags
    new_content = new_content.replace('rounded-full border border-', 'whitespace-nowrap flex-shrink-0 rounded-full border border-')
    
    # 3. Remove .slice(0, 4) or .slice(0, 3) from tags map
    new_content = re.sub(r'\.tags(?:\?)?\.slice\(\d+,\s*\d+\)\.map', r'.tags?.map', new_content)
    
    if new_content != content:
        print(f'Updating {f}')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
