#!/usr/bin/env python3
import re

with open('/Users/sargus/repos/media-player/src/App.tsx', 'r') as f:
    content = f.read()

# Find orphaned closing braces that stand alone on lines (nothing before them except whitespace)
# These are the orphaned braces we need to remove
fixed_content = re.sub(r'^\s*\}\s*$', '\n', content, flags=re.MULTILINE)

with open('/Users/sargus/repos/media-player/src/App.tsx', 'w') as f:
    f.write(fixed_content)

print('Fixed orphaned closing braces')
