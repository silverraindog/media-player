with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

lines[494] = '                  </div>\n                </div>'

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
