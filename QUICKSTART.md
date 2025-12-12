# MCP ACS Process Server - Quick Start Guide

## Installation

```bash
npm install @ai-capabilities-suite/mcp-process
```

## Configuration

### 1. Create a Configuration File

```bash
npx mcp-process --create-config mcp-process-config.json
```

This creates a sample configuration file with secure defaults.

### 2. Edit the Configuration

Edit `mcp-process-config.json` to specify which executables AI agents can launch:

```json
{
  "allowedExecutables": ["node", "npm", "python3", "git"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024,
    "maxCpuTime": 300
  },
  "maxConcurrentProcesses": 10,
  "maxProcessLifetime": 3600,
  "enableAuditLog": true
}
```

**IMPORTANT**: The `allowedExecutables` list is your primary security control. Only executables in this list can be launched by AI agents.

## Running the Server

### Option 1: Using Configuration File

```bash
npx mcp-process --config mcp-process-config.json
```

### Option 2: Using Environment Variable

```bash
export MCP_PROCESS_CONFIG_PATH=./mcp-process-config.json
npx mcp-process
```

### Option 3: Auto-discovery

Place `mcp-process-config.json` in the current directory or `./config/` directory:

```bash
npx mcp-process
```

## Using with Kiro or Other MCP Clients

Add to your MCP client configuration (e.g., Kiro's `mcp.json`):

```json
{
  "mcpServers": {
    "process": {
      "command": "npx",
      "args": [
        "@ai-capabilities-suite/mcp-process",
        "--config",
        "./mcp-process-config.json"
      ]
    }
  }
}
```

## Available Tools

The MCP ACS Process Server provides 12 tools:

1. **process_start** - Launch a new process
2. **process_terminate** - Terminate a process
3. **process_get_stats** - Get resource usage statistics
4. **process_send_stdin** - Send input to process stdin
5. **process_get_output** - Get captured output
6. **process_list** - List all managed processes
7. **process_get_status** - Get process status
8. **process_create_group** - Create a process group
9. **process_add_to_group** - Add process to group
10. **process_terminate_group** - Terminate all processes in group
11. **process_start_service** - Start a long-running service
12. **process_stop_service** - Stop a service

## Example Usage

### Launch a Process

```typescript
// AI agent calls process_start tool
{
  "executable": "node",
  "args": ["--version"],
  "captureOutput": true
}

// Response:
{
  "status": "success",
  "pid": 12345,
  "startTime": "2024-12-03T18:00:00.000Z"
}
```

### Get Process Output

```typescript
// AI agent calls process_get_output tool
{
  "pid": 12345,
  "stream": "both"
}

// Response:
{
  "status": "success",
  "pid": 12345,
  "stdout": "v18.17.0\n",
  "stderr": "",
  "stdoutBytes": 9,
  "stderrBytes": 0
}
```

## Security Features

### What AI Agents CANNOT Do

- Launch executables not in the allowlist
- Launch shell interpreters (bash, sh, etc.) if blocked
- Launch dangerous executables (sudo, rm, dd, etc.)
- Launch setuid/setgid executables
- Modify PATH or other dangerous environment variables
- Send signals to processes they didn't create
- Escalate privileges
- Bypass resource limits
- Launch unlimited concurrent processes
- Keep processes running indefinitely

### What AI Agents CAN Do (Within Allowlist)

- Launch approved executables with arguments
- Set safe environment variables
- Capture stdout/stderr
- Send stdin input
- Monitor resource usage
- Terminate processes they created
- Create process groups
- Set resource limits (within configured maximums)
- Manage long-running services with auto-restart

## Troubleshooting

### "Executable not in allowlist" Error

Add the executable to the `allowedExecutables` array in your configuration file.

### "Configuration file not found" Error

Ensure the configuration file exists at the specified path or in one of the default locations:

- `./mcp-process-config.json`
- `./config/mcp-process.json`

### "allowedExecutables cannot be empty" Error

Your configuration file must specify at least one allowed executable. Use `--create-config` to generate a sample configuration.

## Advanced Configuration

See the full [README.md](./README.md) for advanced configuration options including:

- Working directory restrictions
- Rate limiting
- Network isolation
- Chroot jails
- Linux namespaces
- Seccomp filtering
- And more...

## Support

For issues, questions, or contributions:

- GitHub: <https://github.com/digital-defiance/ai-capabilities-suite>
- Issues: <https://github.com/digital-defiance/ai-capabilities-suite/issues>
