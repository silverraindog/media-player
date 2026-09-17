awk '
/<span>Samba \(SMB\) Media Server Destination Structure:<\/span>/ {
  print "              <span>Samba (SMB) Media Path & Recommended Structure:</span>"
  print "            </div>"
  print "            {media.matchedFilename && ("
  print "              <div className=\"mb-3\">"
  print "                <div className=\"text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1\">Current Detected Location</div>"
  print "                <div className=\"font-mono text-emerald-300 text-[11px] bg-slate-900 p-2 rounded-lg border border-slate-800 break-all\">"
  print "                  //{sambaConfig.server}/{sambaConfig.share}/{media.matchedFilename}"
  print "                </div>"
  print "              </div>"
  print "            )}"
  print "            <div className=\"text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1\">Standardized Layout (Kodi/Plex Compliant)</div>"
  print "            <pre className=\"font-mono text-slate-300 text-[11px] bg-slate-900 p-2.5 rounded-lg border border-slate-800/80 overflow-x-auto\">"
  print "              //{sambaConfig.server}/{sambaConfig.share}/{media.recommendedFolderStructure}"
  next
}
/Samba \(SMB\) Media Server Destination Structure/ { next }
/\/\/{sambaConfig.server}\/{sambaConfig.share}\/{media.recommendedFolderStructure}/ { next }
/className="font-mono text-slate-300 text-xs bg-slate-900 p-2.5 rounded-lg border border-slate-800\/80 overflow-x-auto"/ { next }
{ print $0 }
' src/components/MediaDetailModal.tsx > src/components/MediaDetailModal_new.tsx && mv src/components/MediaDetailModal_new.tsx src/components/MediaDetailModal.tsx
