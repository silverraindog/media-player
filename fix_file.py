import re

with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

for i in range(len(lines)):
    if lines[i].strip() == "":
        # It's an empty line (or only spaces)
        if i+1 < len(lines):
            nxt = lines[i+1].strip()
            if nxt in [')}', '})}', '</button>', '))}']:
                lines[i] = '            </div>'
            elif i+2 < len(lines) and lines[i+2].strip() in [')}', '})}', '</button>', '))}']:
                lines[i] = '            </div>'

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
