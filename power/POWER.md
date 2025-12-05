---
name: "acs-process"
displayName: "ACS Process Manager"
description: "Secure process management with resource monitoring, allowlists, and service orchestration"
keywords:
  [
    "process",
    "process-management",
    "security",
    "monitoring",
    "resource-limits",
    "services",
    "orchestration",
    "allowlist",
  ]
author: "Digital Defiance"
---

# ACS Process Manager Power

## Overview

Enterprise-grade process management for AI agents with strict security boundaries. Launch processes, monitor resources, manage services, and orchestrate workflows - all within secure, configurable boundaries.

**Key capabilities:**

- Secure process launching with allowlists
- Real-time resource monitoring (CPU, memory, I/O)
- Process groups and service management
- Audit logging and security boundaries
- LSP integration with 17 code intelligence features

**VS Code Extension**: `DigitalDefiance.mcp-acs-process`

## Available MCP Servers

### acs-process

**Package:** `@ai-capabilities-suite/mcp-process`
**Connection:** Local MCP server via npx

## Configuration

```json
{
  "mcpServers": {
    "acs-process": {
      "command": "npx",
      "args": ["-y", "@ai-capabilities-suite/mcp-process@latest"]
    }
  }
}
```

## Resources

- [Package on npm](https://www.npmjs.com/package/@ai-capabilities-suite/mcp-process)
- [GitHub Repository](https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process)
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=DigitalDefiance.mcp-acs-process)
- [Security Documentation](https://github.com/digital-defiance/ai-capabilities-suite/blob/main/packages/mcp-process/SECURITY.md)

---

**Package:** `@ai-capabilities-suite/mcp-process`  
**License:** MIT
