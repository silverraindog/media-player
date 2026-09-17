with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

for i in range(710, 725):
    if '<ChevronRight' in lines[i]:
        lines.insert(i, '                      </div>')
        break

for i in range(710, 725):
    if '                  );' in lines[i]:
        lines.insert(i, '                </div>')
        break

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
