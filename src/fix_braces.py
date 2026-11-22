#!/usr/bin/env python3
import re

with open('/Users/sargus/repos/media-player/src/App.tsx', 'r') as f:
    content = f.read()

# Find orphaned closing braces at end of lines (standalone })
# These are braces that appear on their own line with nothing before them
fixed_content = re.sub(r'\}\s*$', r'\n', content)

with open('/Users/sargus/repos/media-player/src/App.tsx', 'w') as f:
    f.write(fixed_content)

print("Fixed orphaned closing braces")
