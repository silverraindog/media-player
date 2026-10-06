with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

for i in range(650, 670):
    if '</div>' in lines[i]:
        lines[i] = ''

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
