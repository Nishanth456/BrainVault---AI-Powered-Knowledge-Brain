import glob

target = 'filterOptions={{ domains: ["Engineering", "Data Science", "Design", "Management", "General"] }}'
files = glob.glob('c:/Users/nisha/Projects/BrainVault/frontend/app/knowledge/**/page.tsx', recursive=True)
for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    if target in content:
        print(f'Updating {f}')
        new_content = content.replace(target, '')
        with open(f, 'w', encoding='utf-8') as file:
            file.write(new_content)
