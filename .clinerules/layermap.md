# Codebase Exploration & Architecture Rules

When exploring the codebase, tracing dependencies, or planning changes, prioritize the `layermap` MCP tools before falling back to broad `search_files` (grep) or reading full files:

1. **Understand Architecture & Folder Structure:** Call `project_explore_map` first to inspect module boundaries, layers, and high-level structure instead of listing directories recursively.
2. **Locate Symbols & Definitions:** Use `project_search_map` to find functions, classes, types, and entry points before running regex text searches.
3. **Trace Impact & Callers:** Before modifying or refactoring a symbol, call `project_find_references` to check all callers and cross-layer dependencies.
4. **Targeted File Reads:** Once LayerMap identifies the relevant files and line ranges, read only those specific sections rather than loading entire unrelated files.
