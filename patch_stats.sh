awk '
/title: item.title.length > 20/ {
  print "      title: (item.mediaType === '\''series'\'' ? '\''Series / '\'' : item.mediaType === '\''movie'\'' ? '\''Movies / '\'' : '\''Albums / '\'') + (item.title.length > 20 ? item.title.substring(0, 19) + '\'…\'' : item.title),"
  next
}
{ print $0 }
' src/components/LibraryStatsTab.tsx > src/components/LibraryStatsTab_new.tsx && mv src/components/LibraryStatsTab_new.tsx src/components/LibraryStatsTab.tsx
