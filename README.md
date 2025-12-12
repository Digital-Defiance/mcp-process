# MCP ACS Process Server

A Model Context Protocol (MCP) server that provides process management and monitoring capabilities for AI agents, with strict security boundaries enforced by executable allowlists and resource limits.

## 🔗 Repository

This package is now maintained in its own repository: **[https://github.com/Digital-Defiance/mcp-process](https://github.com/Digital-Defiance/mcp-process)**

This repository is part of the [AI Capabilities Suite](https://github.com/Digital-Defiance/ai-capabilities-suite) on GitHub.

## Table of Contents

- [Features](#features)
- [Security](#security)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [MCP Tools](#mcp-tools)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Features

- **Process Launching**: Spawn processes with specified arguments and environment variables
- **Resource Monitoring**: Track CPU, memory, thread count, and I/O usage in real-time
- **Output Capture**: Capture and retrieve stdout and stderr streams separately
- **Process Termination**: Graceful (SIGTERM) and forced (SIGKILL) termination with timeout escalation
- **Service Management**: Long-running services with auto-restart and health checks
- **Process Groups**: Manage related processes and create pipelines
- **Timeout Management**: Automatic process termination after specified duration
- **I/O Management**: Send stdin input and retrieve buffered output
- **Security**: Multi-layer security with executable allowlists, argument validation, and resource limits
- **Audit Logging**: Complete operation tracking for security and compliance

## Security

This server implements defense-in-depth security with 6 layers of validation:

1. **Executable Allowlist**: Only pre-approved executables can be launched
2. **Argument Validation**: Command arguments validated for injection attacks
3. **Environment Sanitization**: Dangerous environment variables removed
4. **Resource Limits**: CPU, memory, and time limits prevent resource exhaustion
5. **Privilege Prevention**: No privilege escalation or setuid executables
6. **Audit Logging**: Complete operation tracking

See [SECURITY.md](./SECURITY.md) for detailed security implementation.

## Installation

### Docker (Recommended)

```bash
docker pull digitaldefiance/mcp-process:latest
```

See [DOCKER.md](./DOCKER.md) for detailed Docker usage instructions.

### NPM

```bash
npm install @ai-capabilities-suite/mcp-process
```

### Yarn

```bash
yarn add @ai-capabilities-suite/mcp-process
```

### Global Installation

```bash
npm install -g @ai-capabilities-suite/mcp-process
```

## Quick Start

### Docker Quick Start

```bash
# Pull the image
docker pull digitaldefiance/mcp-process:latest

# Create config directory
mkdir -p config

# Create configuration
cat > config/mcp-process-config.json << EOF
{
  "allowedExecutables": ["node", "python3", "npm"],
  "maxConcurrentProcesses": 5,
  "enableAuditLog": true
}
EOF

# Run with docker-compose
docker-compose up -d
```

See [DOCKER.md](./DOCKER.md) for detailed Docker instructions.

### NPM Quick Start

#### 1. Create Configuration File

```bash
mcp-process --create-config ./mcp-process-config.json
```

This creates a sample configuration file with secure defaults.

### 2. Edit Configuration

Edit `mcp-process-config.json` to add your allowed executables:

```json
{
  "allowedExecutables": ["node", "python3", "npm", "git"],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024,
    "maxCpuTime": 300
  },
  "maxConcurrentProcesses": 10,
  "maxProcessLifetime": 3600,
  "enableAuditLog": true,
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "requireConfirmation": false
}
```

### 3. Start the Server

```bash
mcp-process --config ./mcp-process-config.json
```

Or use environment variables:

```bash
export MCP_PROCESS_CONFIG_PATH=./mcp-process-config.json
mcp-process
```

### 4. Connect from Your AI Agent

Configure your AI agent (e.g., Kiro, Claude Desktop) to connect to the MCP server via stdio transport.

## Configuration

### Configuration File Locations

The server looks for configuration in the following order:

1. `--config` command line argument
2. `MCP_PROCESS_CONFIG_PATH` environment variable
3. `MCP_PROCESS_CONFIG` environment variable (JSON string)
4. `./mcp-process-config.json`
5. `./config/mcp-process.json`

### Configuration Options

See [SECURITY.md](./SECURITY.md) for detailed configuration options and security settings.

### Minimal Configuration

```json
{
  "allowedExecutables": ["node", "python3"],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024
  },
  "maxConcurrentProcesses": 10,
  "maxProcessLifetime": 3600,
  "enableAuditLog": true,
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "requireConfirmation": false
}
```

## MCP Tools

The server exposes 12 MCP tools for process management:

### process_start

Launch a new process.

**Parameters:**

- `executable` (string, required): Path to executable
- `args` (string[], optional): Command-line arguments
- `cwd` (string, optional): Working directory
- `env` (object, optional): Environment variables
- `timeout` (number, optional): Timeout in milliseconds
- `captureOutput` (boolean, optional): Whether to capture stdout/stderr
- `resourceLimits` (object, optional): Resource limits

**Returns:**

- `pid` (number): Process ID
- `startTime` (string): ISO timestamp of process start

### process_terminate

Terminate a process.

**Parameters:**

- `pid` (number, required): Process ID
- `force` (boolean, optional): Use SIGKILL instead of SIGTERM
- `timeout` (number, optional): Timeout for graceful termination (ms)

**Returns:**

- `exitCode` (number): Process exit code
- `terminationReason` (string): "graceful" or "forced"

### process_get_stats

Get process resource usage statistics.

**Parameters:**

- `pid` (number, required): Process ID
- `includeHistory` (boolean, optional): Include historical data

**Returns:**

- `cpuPercent` (number): CPU usage percentage
- `memoryMB` (number): Memory usage in MB
- `threadCount` (number): Number of threads
- `ioRead` (number): Bytes read
- `ioWrite` (number): Bytes written
- `uptime` (number): Process uptime in seconds
- `history` (array, optional): Historical statistics

### process_send_stdin

Send input to process stdin.

**Parameters:**

- `pid` (number, required): Process ID
- `data` (string, required): Data to send
- `encoding` (string, optional): Text encoding (default: "utf-8")

**Returns:**

- `bytesWritten` (number): Number of bytes written

### process_get_output

Get captured process output.

**Parameters:**

- `pid` (number, required): Process ID
- `stream` (string, optional): "stdout", "stderr", or "both" (default: "both")
- `encoding` (string, optional): Text encoding (default: "utf-8")

**Returns:**

- `stdout` (string): Captured stdout
- `stderr` (string): Captured stderr
- `stdoutBytes` (number): Stdout buffer size
- `stderrBytes` (number): Stderr buffer size

### process_list

List all managed processes.

**Returns:**

- Array of process information objects with PID, command, state, and uptime

### process_get_status

Get detailed process status.

**Parameters:**

- `pid` (number, required): Process ID

**Returns:**

- `state` (string): "running", "stopped", or "crashed"
- `uptime` (number): Process uptime in seconds
- `stats` (object): Current resource usage statistics

### process_create_group

Create a process group.

**Parameters:**

- `name` (string, required): Group name
- `pipeline` (boolean, optional): Whether to create a pipeline

**Returns:**

- `groupId` (string): Group identifier

### process_add_to_group

Add a process to a group.

**Parameters:**

- `groupId` (string, required): Group identifier
- `pid` (number, required): Process ID

### process_terminate_group

Terminate all processes in a group.

**Parameters:**

- `groupId` (string, required): Group identifier

### process_start_service

Start a long-running service with auto-restart.

**Parameters:**

- `name` (string, required): Service name
- `executable` (string, required): Path to executable
- `args` (string[], optional): Command-line arguments
- `cwd` (string, optional): Working directory
- `env` (object, optional): Environment variables
- `restartPolicy` (object, optional): Restart configuration
- `healthCheck` (object, optional): Health check configuration

**Returns:**

- `serviceId` (string): Service identifier
- `pid` (number): Initial process ID

### process_stop_service

Stop a service and disable auto-restart.

**Parameters:**

- `serviceId` (string, required): Service identifier

## Usage Examples

### Example 1: Run a Simple Command

```typescript
// Launch a process
const result = await mcpClient.callTool("process_start", {
  executable: "node",
  args: ["--version"],
  captureOutput: true,
});

console.log("Process started:", result.pid);

// Wait a moment for it to complete
await new Promise((resolve) => setTimeout(resolve, 1000));

// Get output
const output = await mcpClient.callTool("process_get_output", {
  pid: result.pid,
});

console.log("Output:", output.stdout);
```

### Example 2: Monitor Resource Usage

```typescript
// Start a process
const result = await mcpClient.callTool("process_start", {
  executable: "python3",
  args: ["my_script.py"],
  resourceLimits: {
    maxCpuPercent: 50,
    maxMemoryMB: 512,
  },
});

// Monitor resources
const stats = await mcpClient.callTool("process_get_stats", {
  pid: result.pid,
  includeHistory: true,
});

console.log("CPU:", stats.cpuPercent + "%");
console.log("Memory:", stats.memoryMB + "MB");
```

### Example 3: Interactive Process with Stdin

```typescript
// Start an interactive process
const result = await mcpClient.callTool("process_start", {
  executable: "python3",
  args: ["-i"],
  captureOutput: true,
});

// Send input
await mcpClient.callTool("process_send_stdin", {
  pid: result.pid,
  data: 'print("Hello from AI agent")\n',
});

// Wait and get output
await new Promise((resolve) => setTimeout(resolve, 500));
const output = await mcpClient.callTool("process_get_output", {
  pid: result.pid,
});

console.log("Output:", output.stdout);
```

### Example 4: Long-Running Service

```typescript
// Start a service with auto-restart
const service = await mcpClient.callTool("process_start_service", {
  name: "my-api-server",
  executable: "node",
  args: ["server.js"],
  restartPolicy: {
    enabled: true,
    maxRetries: 3,
    backoffMs: 5000,
  },
  healthCheck: {
    command: "curl http://localhost:3000/health",
    interval: 30000,
    timeout: 5000,
  },
});

console.log("Service started:", service.serviceId);
```

### Example 5: Process Group Pipeline

```typescript
// Create a process group
const group = await mcpClient.callTool("process_create_group", {
  name: "data-pipeline",
  pipeline: true,
});

// Start first process
const proc1 = await mcpClient.callTool("process_start", {
  executable: "cat",
  args: ["data.txt"],
  captureOutput: true,
});

// Add to group
await mcpClient.callTool("process_add_to_group", {
  groupId: group.groupId,
  pid: proc1.pid,
});

// Start second process (will receive output from first)
const proc2 = await mcpClient.callTool("process_start", {
  executable: "grep",
  args: ["pattern"],
  captureOutput: true,
});

await mcpClient.callTool("process_add_to_group", {
  groupId: group.groupId,
  pid: proc2.pid,
});
```

## Troubleshooting

### Issue: "Executable not in allowlist"

**Cause:** The executable you're trying to launch is not in the `allowedExecutables` configuration.

**Solution:** Add the executable to your configuration file:

```json
{
  "allowedExecutables": ["node", "python3", "/path/to/your/executable"]
}
```

You can use:

- Absolute paths: `/usr/bin/node`
- Basenames: `node`
- Glob patterns: `/usr/bin/*`

### Issue: "Shell interpreters are blocked"

**Cause:** You're trying to launch a shell (bash, sh, cmd.exe, etc.) and `blockShellInterpreters` is enabled.

**Solution:** Either:

1. Set `blockShellInterpreters: false` in your configuration (not recommended)
2. Launch the actual executable directly instead of through a shell

### Issue: "Process not found"

**Cause:** The process has already terminated or the PID is invalid.

**Solution:** Check if the process is still running using `process_list` or `process_get_status`.

### Issue: "CPU limit exceeded" or "Memory limit exceeded"

**Cause:** The process exceeded configured resource limits.

**Solution:** Increase resource limits in your configuration or when launching the process:

```json
{
  "defaultResourceLimits": {
    "maxCpuPercent": 90,
    "maxMemoryMB": 2048
  }
}
```

### Issue: "Maximum concurrent processes reached"

**Cause:** You've reached the `maxConcurrentProcesses` limit.

**Solution:**

1. Terminate some running processes
2. Increase `maxConcurrentProcesses` in your configuration
3. Wait for processes to complete

### Issue: "Process stdin not available"

**Cause:** The process stdin is closed or the process doesn't support stdin input.

**Solution:** Ensure the process is still running and was started with stdin enabled.

### Issue: Configuration file not found

**Cause:** The server can't find your configuration file.

**Solution:**

1. Use `--config` flag: `mcp-process --config /path/to/config.json`
2. Set environment variable: `export MCP_PROCESS_CONFIG_PATH=/path/to/config.json`
3. Place config at `./mcp-process-config.json`

### Debugging

Enable debug logging by setting the audit log level:

```json
{
  "enableAuditLog": true,
  "auditLogLevel": "debug"
}
```

Check the audit log for detailed information about process operations and security violations.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/digital-defiance/ai-capabilities-suite.git
cd ai-capabilities-suite/packages/mcp-process

# Install dependencies
npm install

# Build
npm run build
```

### Testing

```bash
# Run all tests (unit, integration, and e2e)
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- SecurityManager.spec.ts

# Run only e2e tests
npm run test:e2e

# Run minimal e2e smoke tests (quick validation)
npm run test:e2e:minimal
```

#### End-to-End (E2E) Testing

The MCP ACS Process Server includes comprehensive e2e tests that validate the complete system behavior by spawning the server as a child process and communicating via stdio using JSON-RPC protocol. These tests ensure the server works correctly in real-world usage scenarios.

**E2E Test Structure:**

- `server.e2e.spec.ts` - Comprehensive e2e tests covering all MCP tools and protocol features
- `server.minimal.e2e.spec.ts` - Quick smoke tests for basic functionality validation (< 30 seconds)

**Running E2E Tests:**

```bash
# Run comprehensive e2e tests
npm run test:e2e

# Run minimal smoke tests for quick feedback
npm run test:e2e:minimal

# Run e2e tests with specific pattern
npm test -- --testPathPattern=e2e.spec.ts

# Run e2e tests with verbose output
npm test -- --testPathPattern=e2e.spec.ts --verbose
```

**What E2E Tests Validate:**

- MCP protocol initialization and handshake
- Tool discovery via tools/list
- Process launch operations with security enforcement
- Process monitoring and resource statistics
- Process termination (graceful and forced)
- Output capture (stdout/stderr)
- Service management with auto-restart
- Error handling and validation
- Security policy enforcement
- Resource limit enforcement
- Timeout handling
- JSON-RPC protocol compliance

**E2E Test Requirements:**

1. The server must be built before running e2e tests: `npm run build`
2. Tests spawn the server from `dist/cli.js`
3. Tests communicate via stdio using JSON-RPC 2.0 protocol
4. All spawned processes are cleaned up after tests complete

**Debugging E2E Test Failures:**

If e2e tests fail, follow these steps:

1. **Ensure the server is built:**

   ```bash
   npm run build
   ```

2. **Check if the CLI exists:**

   ```bash
   ls -la dist/cli.js
   ```

3. **Run tests with verbose output:**

   ```bash
   npm test -- --testPathPattern=e2e.spec.ts --verbose
   ```

4. **Check for server startup errors:**

   - E2E tests capture server stderr output
   - Look for error messages in test output
   - Common issues: missing dependencies, permission errors, port conflicts

5. **Verify server can start manually:**

   ```bash
   node dist/cli.js --help
   ```

6. **Run minimal tests first:**

   ```bash
   npm run test:e2e:minimal
   ```

   If minimal tests pass but comprehensive tests fail, the issue is likely with specific functionality rather than basic server operation.

7. **Check process cleanup:**

   ```bash
   # List any orphaned node processes
   ps aux | grep node
   ```

8. **Enable debug logging:**
   Set `DEBUG=*` environment variable to see detailed logs:

   ```bash
   DEBUG=* npm test -- --testPathPattern=e2e.spec.ts
   ```

**Common E2E Test Issues:**

| Issue                         | Cause                          | Solution                              |
| ----------------------------- | ------------------------------ | ------------------------------------- |
| "Server executable not found" | Server not built or wrong path | Run `npm run build`                   |
| "Server failed to start"      | Server crash on startup        | Check stderr output in test logs      |
| "Request timeout"             | Server not responding          | Increase timeout or check server logs |
| "Process not cleaned up"      | Test cleanup failure           | Run `npm test -- --forceExit`         |
| "Port already in use"         | Previous test didn't clean up  | Kill orphaned processes               |
| "Permission denied"           | Insufficient permissions       | Check file permissions on dist/cli.js |

**CI Environment Considerations:**

E2E tests are designed to run in CI environments with the following considerations:

- **Headless operation**: No display server required
- **Timeout adjustments**: CI environments get 50% longer timeouts
- **Process cleanup**: All processes cleaned up even on test failure
- **No interactive input**: Tests run fully automated
- **Resource constraints**: Tests handle slower CI environments gracefully

**CI Configuration Example:**

```yaml
# .github/workflows/test.yml
- name: Build
  run: npm run build

- name: Run minimal e2e tests
  run: npm run test:e2e:minimal

- name: Run full test suite
  run: npm test
  env:
    CI: true
```

**Property-Based Testing:**

E2E tests include property-based tests using `fast-check` to validate universal properties:

- JSON-RPC request/response ID matching
- Concurrent request handling
- Process launch with random allowed executables
- Security rejection for blocked executables

These tests run multiple iterations with randomly generated inputs to ensure correctness across a wide range of scenarios.

### Linting

```bash
npm run lint
```

### Building

```bash
# Clean build directory
npm run clean

# Build TypeScript
npm run build
```

### Publishing

```bash
# Publish to npm (requires authentication)
npm run publish:public
```

## Architecture

The MCP ACS Process Server consists of several core components:

- **MCPServer**: Main server implementing MCP protocol
- **SecurityManager**: Multi-layer security validation
- **ProcessLauncher**: Process spawning and configuration
- **ProcessManager**: Process lifecycle management
- **ResourceMonitor**: CPU, memory, and I/O monitoring
- **IOManager**: Stdin/stdout/stderr handling
- **ProcessTerminator**: Graceful and forced termination
- **ServiceManager**: Long-running service management
- **TimeoutManager**: Process timeout enforcement
- **ProcessGroup**: Process group and pipeline management
- **ConfigLoader**: Configuration file loading and validation

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines:
<https://github.com/digital-defiance/ai-capabilities-suite>

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Support

- GitHub Issues: <https://github.com/digital-defiance/ai-capabilities-suite/issues>
- Email: <info@digitaldefiance.org>

## Related Projects

- [MCP Filesystem](https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-filesystem) - Filesystem operations for AI agents
- [MCP Recording](https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-recording) - Session recording and playback
- [MCP ACS Debugger](https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-debugger) - MCP protocol debugging tools

## Acknowledgments

Built with:

- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/sdk) - MCP protocol implementation
- [pidusage](https://github.com/soyuka/pidusage) - Process resource monitoring
- [which](https://github.com/npm/node-which) - Executable path resolution
- [minimatch](https://github.com/isaacs/minimatch) - Glob pattern matching
