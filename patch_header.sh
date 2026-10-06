awk '
/id="tab-stats"/ {
  print "            <button"
  print "              id=\"tab-dedup\""
  print "              onClick={() => setActiveTab('\''dedup'\'')}"
  print "              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${"
  print "                activeTab === '\''dedup'\''"
  print "                  ? '\''bg-rose-600 text-white shadow-sm'\''"
  print "                  : '\''text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'\''"
  print "              }`}"
  print "            >"
  print "              <GitMerge className=\"w-4 h-4 text-amber-400\" />"
  print "              <span>Dedup</span>"
  print "            </button>"
}
{ print $0 }
' src/components/Header.tsx > src/components/Header_new.tsx && mv src/components/Header_new.tsx src/components/Header.tsx
