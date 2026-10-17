awk '
/^[ \t]*<button$/ {
  count++
  if (count > 1) {
    # Skip
    next
  }
}
/id="tab-dedup"/ {
  count = 0
}
{ print $0 }
' src/components/Header.tsx > src/components/Header_new.tsx && mv src/components/Header_new.tsx src/components/Header.tsx
