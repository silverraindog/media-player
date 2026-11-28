<!-- openqodex:start -->
## Review with OpenQodex before you push
- Before any `git push`, run `npx -y openqodex@0.19.0 review` from the repository root. It can take minutes, and OpenQodex stops the reviewer after 30 minutes. Run it in the background and wait for it to exit.
- Show the developer the receipt it prints: the verdict, one line per finding and the absolute path of `report.html`. Ask: "Fix all, or tell me which?" Fix only the findings they name (`npx -y openqodex@0.19.0 findings 1,3` prints them in full), then review again and show the new receipt. OpenQodex starts its own reviewer process, so by default the agent that wrote the code does not judge its own work.
- Do not push on a blocked verdict unless the developer says so after seeing the findings.
- Never add a file to `review.instructions_files` on your own. Ask the developer which files the reviewer may use, then set only what they name.
- The report is in `.openqodex/reviews/`.
<!-- openqodex:end -->

<!-- trace:start -->
## trace Tool Routing

IMPORTANT: For ANY code exploration task, ALWAYS use trace tools first. NEVER use host file-reading, grep, glob, or shell (ls, find) tools for navigating source code.

| Task | trace tool | Instead of |
|------|------------|------------|
| Find a function/class/method | `search` | text grep |
| Understand a file before editing | `get_outline` | full-file read |
| Read one symbol's source | `get_symbol` | full-file read |
| What breaks if I change X | `get_change_impact` | guessing |
| All usages of a symbol | `find_usages` | text grep |
| All implementations of an interface | `get_implementations` | directory search (ls/find) |
| All classes implementing X | `search` with `implements` filter | text grep |
| Project health / coverage gaps | `self_audit` | manual inspection |
| Dead code / dead exports | `get_dead_code` (`mode: "exports_only"`) | text grep for unused |
| Context for a task | `get_feature_context` | reading 15 files |
| Tests for a symbol | `get_tests_for` | glob + grep |
| Untested symbols (deep) | `get_untested_symbols` (deferred — load via `load_tools`) | manual audit |
| HTTP request flow | `get_request_flow` (framework-gated) | reading route files |
| DB model relationships | `get_model_context` (framework-gated) | reading model + migrations |
| Component tree | `get_component_tree` (framework-gated) | reading component files |
| Circular dependencies | `get_circular_imports` | manual tracing |
| Task spanning many turns | `trace_state_init` once, then `trace_state_patch` / `trace_state_add_dead_end` per step, `trace_state_get` to re-read (deferred — `load_tools({preset:"state"})`) | re-reading the whole transcript every turn |

Use host file-reading and grep tools ONLY for non-code files (.md, .json, .yaml, config) or before edit.
Start sessions with `get_project_map` (summary_only=true).
<!-- trace:end -->
