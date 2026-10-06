with open('src/components/MediaDetailModal.tsx', 'r') as f:
    lines = f.read().split('\n')

# Insert correct divs
lines[660] = '                      </div>'
lines[664] = '              </div>\n            </div>'

with open('src/components/MediaDetailModal.tsx', 'w') as f:
    f.write('\n'.join(lines))
