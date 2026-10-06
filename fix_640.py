with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

for i in range(630, 650):
    if '{isActive && (' in lines[i]:
        # After this, the span is closed, then )}
        pass
    if ')}' in lines[i] and 'animate-pulse' not in lines[i]:
        # wait, the ) } for isActive
        lines[i] = lines[i] + '\n                        </div>'

for i in range(630, 650):
    if '{ver.seasonsCount &&' in lines[i]:
        lines[i] = lines[i] + '\n                        </div>'

for i in range(630, 650):
    if '{ver.folderPath || ver.title}' in lines[i]:
        lines[i] = lines[i] + '\n                        </div>\n                      </div>'

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
