awk '
/{activeTab === '\''cleaner'\'' && (/ {
  print "        {activeTab === '\''dedup'\'' && ("
  print "          <DeduplicationManagerTab"
  print "            mediaLibrary={mediaLibrary}"
  print "            onRemoveItem={(id) => {"
  print "              setMediaLibrary(prev => prev.filter(m => m.id !== id));"
  print "            }}"
  print "          />"
  print "        )}"
}
{ print $0 }
' src/App.tsx > src/App_new.tsx && mv src/App_new.tsx src/App.tsx
