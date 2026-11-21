<!-- openqodex:start -->
## Review with OpenQodex before you push
- Before any `git push`, run `npx -y openqodex@0.19.0 review` from the repository root. It can take minutes, and OpenQodex stops the reviewer after 30 minutes. Run it in the background and wait for it to exit.
- Show the developer the receipt it prints: the verdict, one line per finding and the absolute path of `report.html`. Ask: "Fix all, or tell me which?" Fix only the findings they name (`npx -y openqodex@0.19.0 findings 1,3` prints them in full), then review again and show the new receipt. OpenQodex starts its own reviewer process, so by default the agent that wrote the code does not judge its own work.
- Do not push on a blocked verdict unless the developer says so after seeing the findings.
- Never add a file to `review.instructions_files` on your own. Ask the developer which files the reviewer may use, then set only what they name.
- The report is in `.openqodex/reviews/`.
<!-- openqodex:end -->

## Available MCP Servers
Use the following Model Context Protocol (MCP) servers as needed to interact with the codebase, filesystem, and QA/review tools:

- **filesystem**
  - **Purpose**: Standard filesystem operations scoped to specific repositories.
  - **Command**: `npx -y @modelcontextprotocol/server-filesystem /Users/sargus/repos/media-player /Users/sargus/repos/ClawDock-Agent-Orchestrator`
  - **Allowed Paths**: `/Users/sargus/repos/media-player`, `/Users/sargus/repos/ClawDock-Agent-Orchestrator`

- **layermap**
  - **Purpose**: Architecture and layer mapping analysis.
  - **Command**: `npx -y layermap mcp`

- **MCP ACS Filesystem Manager**
  - **Purpose**: Advanced filesystem management via AI Capabilities Suite.
  - **Command**: `npx -y @ai-capabilities-suite/mcp-filesystem`

- **gitnexus**
  - **Purpose**: Git repository graph and code intelligence.
  - **Command**: `npx -y gitnexus` *(Verify exact arguments if any were omitted in the snippet)*

- **repomix**
  - **Purpose**: Packing and analyzing repository contents into AI-friendly formats.
  - **Command**: `npx -y repomix --mcp`

- **openqodex**
  - **Purpose**: Automated code review and findings inspection.
  - **Command**: `/Users/sargus/.openqodex/bin/openqodex mcp`

- **agent-qa**
  - **Purpose**: Automated quality assurance and testing workflows.
  - **Command**: `npx agent-qa mcp`
