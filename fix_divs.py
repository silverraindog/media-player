import re

with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

new_lines = []
for i, line in enumerate(lines):
    new_lines.append(line)
    
    # Check if the next line has a closing brace or element that expects the previous div to be closed.
    # Actually, we can just look at my patch log.
