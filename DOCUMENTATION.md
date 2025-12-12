# MCP ACS Process Server - Technical Documentation

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Public API Reference](#public-api-reference)
- [Security Validation Layers](#security-validation-layers)
- [Error Codes and Meanings](#error-codes-and-meanings)
- [Component Documentation](#component-documentation)
- [Type Definitions](#type-definitions)
- [Integration Guide](#integration-guide)

## Architecture Overview

The MCP ACS Process Server is built with a modular architecture consisting of several core components:

```
┌─────────────────────────────────────────────────────────────┐
│                        MCPServer                            │
│  - Server lifecycle management                              │
│  - Tool registration and routing                            │
│  - Graceful shutdown handling                               │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┬─────────────┬──────────────┐
    │             │             │             │              │
┌───▼────┐  ┌────▼─────┐  ┌───▼────┐  ┌─────▼──────┐  ┌───▼────────┐
│Security│  │ Process  │  │Resource│  │   I/O      │  │  Service   │
│Manager │  │ Launcher │  │Monitor │  │  Manager   │  │  Manager   │
└────────┘  └──────────┘  └────────┘  └────────────┘  └────────────┘
```

### Component Responsibilities

- **MCPServer**: Main server orchestration, tool registration, lifecycle management
- **SecurityManager**: Multi-layer security validation, allowlist enforcement
- **ProcessLauncher**: Process spawning, environment setup, output capture
- **ProcessManager**: Process tracking, lifecycle management, cleanup
- **ResourceMonitor**: CPU/memory/IO monitoring, limit enforcement
- **IOManager**: Stdin/stdout/stderr handling, buffering
- **ProcessTerminator**: Graceful and forced termination, timeout escalation
- **ServiceManager**: Long-running service management, auto-restart, health checks
- **TimeoutManager**: Process timeout enforcement
- **ProcessGroup**: Process group and pipeline management
- **ConfigLoader**: Configuration file loading and validation
- **ErrorHandler**: Structured error responses

## Public API Reference

### MCPServer

Main server class that orchestrates all components.

```typescript
/**
 * MCP ACS Process Server
 * Main server class that orchestrates all components
 */
class MCPServer {
  /**
   * Create a new MCP ACS Process Server
   * @param config Optional security configuration (loads from file if not provided)
   */
  constructor(config?: SecurityConfig);

  /**
   * Start the MCP server with stdio transport
   * Registers all tools and begins listening for requests
   * @throws Error if server is already running or configuration is invalid
   */
  async start(): Promise<void>;

  /**
   * Stop the MCP server and clean up all resources
   * Terminates all managed processes gracefully
   */
  async stop(): Promise<void>;
}
```

### SecurityManager

Multi-layer security validation for process operations.

```typescript
/**
 * SecurityManager - Multi-layer security validation
 * Implements 6 layers of executable validation
 */
class SecurityManager {
  /**
   * Create a new SecurityManager
   * @param config Security configuration
   * @throws Error if allowlist is empty or configuration is invalid
   */
  constructor(config: SecurityConfig);

  /**
   * Validate executable against all security layers
   * @param executable Path to executable
   * @param args Command-line arguments
   * @throws SecurityError if validation fails at any layer
   */
  validateExecutable(executable: string, args: string[]): void;

  /**
   * Validate command-line arguments for injection attacks
   * @param args Arguments to validate
   * @throws SecurityError if arguments contain suspicious patterns
   */
  validateArguments(args: string[]): void;

  /**
   * Sanitize environment variables by removing dangerous ones
   * @param env Environment variables
   * @returns Sanitized environment variables
   * @throws SecurityError if environment contains injection attempts
   */
  sanitizeEnvironment(env: Record<string, string>): Record<string, string>;

  /**
   * Validate working directory against allowed/blocked lists
   * @param cwd Working directory path
   * @throws SecurityError if directory is not allowed
   */
  validateWorkingDirectory(cwd: string): void;

  /**
   * Check if concurrent process limit has been reached
   * @throws Error if limit exceeded
   */
  checkConcurrentLimit(): void;

  /**
   * Check if launch rate limit has been exceeded for an agent
   * @param agentId Agent identifier
   * @throws SecurityError if rate limit exceeded
   */
  checkLaunchRateLimit(agentId: string): void;

  /**
   * Enforce resource limits for a running process
   * @param pid Process ID
   * @param limits Resource limits to enforce
   * @throws Error if limits exceeded (also terminates process)
   */
  enforceResourceLimits(pid: number, limits: ResourceLimits): void;

  /**
   * Validate that a signal target is a managed process
   * @param pid Process ID
   * @throws SecurityError if process is not managed
   */
  validateSignalTarget(pid: number): void;

  /**
   * Log an audit event
   * @param operation Operation name
   * @param executable Executable path
   * @param pid Process ID
   * @param result Operation result
   */
  auditOperation(
    operation: string,
    executable: string,
    pid: number,
    result: string
  ): void;
}
```

### ProcessManager

Manages all process lifecycle and tracking.

```typescript
/**
 * ProcessManager - Process lifecycle management
 */
class ProcessManager {
  /**
   * Register a managed process
   * @param process Managed process information
   * @param childProcess Optional child process instance
   */
  register(process: ManagedProcess, childProcess?: ChildProcess): void;

  /**
   * Unregister a managed process
   * @param pid Process ID
   */
  unregister(pid: number): void;

  /**
   * Get a managed process by PID
   * @param pid Process ID
   * @returns Managed process or undefined
   */
  get(pid: number): ManagedProcess | undefined;

  /**
   * Get all managed processes
   * @returns Array of managed processes
   */
  getAll(): ManagedProcess[];

  /**
   * Get process status information
   * @param pid Process ID
   * @returns Status information or undefined
   */
  getStatus(pid: number):
    | {
        state: string;
        uptime: number;
        stats: ProcessStats;
      }
    | undefined;

  /**
   * Create a new process group
   * @param name Group name
   * @param pipeline Whether to create a pipeline
   * @returns Group ID
   */
  createGroup(name: string, pipeline: boolean): string;

  /**
   * Add a process to a group
   * @param groupId Group identifier
   * @param pid Process ID
   * @throws Error if group or process not found
   */
  addToGroup(groupId: string, pid: number): void;

  /**
   * Get all processes in a group
   * @param groupId Group identifier
   * @returns Array of PIDs
   */
  getGroupProcesses(groupId: string): number[];

  /**
   * Get group status
   * @param groupId Group identifier
   * @returns Group status information
   */
  getGroupStatus(groupId: string): GroupStatus;
}
```

### ResourceMonitor

Tracks CPU, memory, and I/O usage.

```typescript
/**
 * ResourceMonitor - Resource usage monitoring
 */
class ResourceMonitor {
  /**
   * Start monitoring a process
   * @param pid Process ID
   * @param limits Resource limits to enforce
   */
  startMonitoring(pid: number, limits: ResourceLimits): void;

  /**
   * Stop monitoring a process
   * @param pid Process ID
   */
  stopMonitoring(pid: number): void;

  /**
   * Get current process statistics
   * @param pid Process ID
   * @returns Current statistics or undefined
   */
  async getStats(pid: number): Promise<ProcessStats | undefined>;

  /**
   * Get historical statistics
   * @param pid Process ID
   * @returns Array of historical statistics
   */
  getHistory(pid: number): ProcessStats[];

  /**
   * Get system-wide statistics
   * @returns System statistics
   */
  async getSystemStats(): Promise<{
    totalCpu: number;
    totalMemoryMB: number;
    processCount: number;
  }>;
}
```

### IOManager

Manages stdin/stdout/stderr for processes.

```typescript
/**
 * IOManager - I/O stream management
 */
class IOManager {
  /**
   * Send data to process stdin
   * @param pid Process ID
   * @param data Data to send
   * @param encoding Text encoding
   * @returns Number of bytes written
   * @throws Error if stdin not available
   */
  sendStdin(pid: number, data: string, encoding: string): number;

  /**
   * Close process stdin
   * @param pid Process ID
   */
  closeStdin(pid: number): void;

  /**
   * Get captured output
   * @param pid Process ID
   * @param stream Which stream(s) to retrieve
   * @param encoding Text encoding
   * @returns Output data
   */
  getOutput(
    pid: number,
    stream: "stdout" | "stderr" | "both",
    encoding: string
  ): {
    stdout: string;
    stderr: string;
    stdoutBytes: number;
    stderrBytes: number;
  };
}
```

## Security Validation Layers

Every process launch request goes through six security layers in order:

### Layer 1: Executable Resolution

**Purpose**: Verify the executable exists and is accessible.

**Implementation**:

```typescript
const resolved = which.sync(executable, { nothrow: true });
if (!resolved) {
  throw new SecurityError("Executable not found");
}
```

**Failure Conditions**:

- Executable not found in PATH
- Executable path does not exist
- No execute permissions

### Layer 2: Dangerous Executable Check

**Purpose**: Block known dangerous commands that should never be executed.

**Hardcoded Blocklist**:

- Unix/Linux: `sudo`, `su`, `rm`, `dd`, `chmod`, `shutdown`, etc.
- Windows: `runas.exe`, `reg.exe`, `diskpart.exe`, `shutdown.exe`, etc.

**Implementation**:

```typescript
const basename = path.basename(resolved);
if (this.DANGEROUS_EXECUTABLES.includes(basename)) {
  throw new SecurityError("Executable is blocked for security reasons");
}
```

**Failure Conditions**:

- Executable is in the hardcoded dangerous list
- Cannot be overridden by configuration

### Layer 3: Shell Interpreter Check

**Purpose**: Optionally block shell access to prevent command injection.

**Blocked Shells** (when `blockShellInterpreters: true`):

- Unix/Linux: `bash`, `sh`, `zsh`, `fish`, `csh`, `tcsh`, `ksh`
- Windows: `cmd.exe`, `powershell.exe`, `pwsh.exe`

**Implementation**:

```typescript
if (
  this.config.blockShellInterpreters &&
  this.SHELL_INTERPRETERS.includes(basename)
) {
  throw new SecurityError("Shell interpreters are blocked");
}
```

**Failure Conditions**:

- Executable is a shell interpreter
- `blockShellInterpreters` is enabled

### Layer 4: Privilege Check

**Purpose**: Block executables with elevated privileges.

**Unix/Linux** (when `blockSetuidExecutables: true`):

```typescript
const stats = fs.statSync(resolved);
const isSetuid = (stats.mode & fs.constants.S_ISUID) !== 0;
const isSetgid = (stats.mode & fs.constants.S_ISGID) !== 0;

if (isSetuid || isSetgid) {
  throw new SecurityError("Setuid/setgid executables are blocked");
}
```

**Windows**: Checks for admin tools and UAC elevation requirements.

**Failure Conditions**:

- Executable has setuid or setgid bit set (Unix/Linux)
- Executable requires UAC elevation (Windows)
- `blockSetuidExecutables` is enabled

### Layer 5: Allowlist Check

**Purpose**: Only permit explicitly allowed executables.

**Implementation**:

```typescript
const isAllowed = Array.from(this.allowlist).some((pattern) => {
  if (pattern.includes("*")) {
    return minimatch(resolved, pattern) || minimatch(basename, pattern);
  }
  return resolved === pattern || basename === pattern;
});

if (!isAllowed) {
  throw new SecurityError("Executable not in allowlist");
}
```

**Matching Rules**:

- Exact path match: `/usr/bin/node`
- Basename match: `node`
- Glob pattern: `/usr/bin/*`

**Failure Conditions**:

- Executable not in allowlist
- No matching pattern found

### Layer 6: Argument Validation

**Purpose**: Prevent command injection via arguments.

**Checks**:

- Command substitution: `$(...)`, `` `...` ``
- Shell metacharacters: `|`, `;`, `&`, `\n`
- Path traversal: `../`, `..\`

**Implementation**:

```typescript
for (const arg of args) {
  if (
    arg.includes("$(") ||
    arg.includes("`") ||
    arg.includes("|") ||
    arg.includes(";") ||
    arg.includes("&") ||
    arg.includes("\n")
  ) {
    throw new SecurityError("Argument contains suspicious characters");
  }

  if (arg.includes("../") || arg.includes("..\\")) {
    throw new SecurityError("Argument contains path traversal");
  }
}
```

**Failure Conditions**:

- Arguments contain command injection patterns
- Arguments contain path traversal sequences

## Error Codes and Meanings

### Security Errors

| Error Code            | Message                                    | Meaning                                                      | Resolution                                           |
| --------------------- | ------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------- |
| `EXEC_NOT_FOUND`      | Executable not found                       | Executable doesn't exist or isn't in PATH                    | Check executable path, ensure it's installed         |
| `EXEC_DANGEROUS`      | Executable is blocked for security reasons | Executable is in hardcoded dangerous list                    | Cannot be overridden - use alternative tool          |
| `EXEC_SHELL_BLOCKED`  | Shell interpreters are blocked             | Trying to launch a shell with `blockShellInterpreters: true` | Disable shell blocking or launch executable directly |
| `EXEC_SETUID_BLOCKED` | Setuid/setgid executables are blocked      | Executable has elevated privileges                           | Remove setuid/setgid bit or disable blocking         |
| `EXEC_NOT_ALLOWED`    | Executable not in allowlist                | Executable not in `allowedExecutables`                       | Add executable to allowlist                          |
| `ARG_INJECTION`       | Argument contains suspicious characters    | Argument contains command injection patterns                 | Remove suspicious characters from arguments          |
| `ARG_TRAVERSAL`       | Argument contains path traversal           | Argument contains `../` or `..\`                             | Use absolute paths or remove traversal               |
| `ENV_BLOCKED`         | Environment variable blocked               | Trying to set dangerous environment variable                 | Remove blocked variable from environment             |
| `ENV_INJECTION`       | Suspicious environment variable value      | Environment value contains injection patterns                | Remove suspicious characters from value              |
| `ENV_TOO_LONG`        | Environment variable too long              | Environment value exceeds 4096 bytes                         | Reduce environment variable size                     |
| `ENV_SIZE_EXCEEDED`   | Total environment size exceeds limit       | Total environment exceeds 64KB                               | Reduce number or size of environment variables       |
| `DIR_NOT_ALLOWED`     | Working directory not in allowed list      | Directory not in `allowedWorkingDirectories`                 | Add directory to allowed list or change directory    |
| `RATE_LIMIT`          | Process launch rate limit exceeded         | Too many launches in time window                             | Wait for rate limit window to reset                  |
| `SIGNAL_UNMANAGED`    | Cannot send signal to unmanaged process    | Trying to signal a process not created by server             | Only signal processes you created                    |

### Process Errors

| Error Code                | Message                     | Meaning                                       | Resolution                                       |
| ------------------------- | --------------------------- | --------------------------------------------- | ------------------------------------------------ |
| `PROC_NOT_FOUND`          | Process not found           | PID doesn't exist or process terminated       | Check process list, verify PID                   |
| `PROC_SPAWN_FAILED`       | Failed to spawn process     | Process couldn't be started                   | Check executable path, permissions, arguments    |
| `PROC_ALREADY_TERMINATED` | Process already terminated  | Trying to operate on terminated process       | Check process status before operation            |
| `PROC_STDIN_CLOSED`       | Process stdin not available | Stdin is closed or process doesn't support it | Check if process is still running                |
| `PROC_STDIN_WRITE_FAILED` | Failed to write to stdin    | Write operation failed                        | Check if process is still running, stdin is open |
| `PROC_TIMEOUT`            | Process execution timeout   | Process exceeded timeout limit                | Increase timeout or optimize process             |
| `PROC_CRASHED`            | Process crashed             | Process exited with non-zero code             | Check process logs, fix application error        |

### Resource Errors

| Error Code                 | Message                              | Meaning                               | Resolution                                 |
| -------------------------- | ------------------------------------ | ------------------------------------- | ------------------------------------------ |
| `RESOURCE_CPU_EXCEEDED`    | CPU limit exceeded                   | Process used more CPU than allowed    | Increase CPU limit or optimize process     |
| `RESOURCE_MEMORY_EXCEEDED` | Memory limit exceeded                | Process used more memory than allowed | Increase memory limit or optimize process  |
| `RESOURCE_TIME_EXCEEDED`   | CPU time limit exceeded              | Process ran longer than allowed       | Increase time limit or optimize process    |
| `RESOURCE_FD_EXCEEDED`     | File descriptor limit exceeded       | Process opened too many files         | Increase FD limit or close unused files    |
| `CONCURRENT_LIMIT`         | Maximum concurrent processes reached | Too many processes running            | Terminate some processes or increase limit |
| `LIFETIME_EXCEEDED`        | Process lifetime exceeded            | Process ran longer than max lifetime  | Process will be terminated automatically   |

### Service Errors

| Error Code                    | Message                          | Meaning                                 | Resolution                                  |
| ----------------------------- | -------------------------------- | --------------------------------------- | ------------------------------------------- |
| `SERVICE_NOT_FOUND`           | Service not found                | Service ID doesn't exist                | Check service list, verify ID               |
| `SERVICE_ALREADY_RUNNING`     | Service already running          | Trying to start already-running service | Stop service first or use restart           |
| `SERVICE_HEALTH_CHECK_FAILED` | Health check failed              | Service health check returned failure   | Check service logs, fix application         |
| `SERVICE_MAX_RESTARTS`        | Maximum restart attempts reached | Service crashed too many times          | Fix application error, increase max retries |

### Group Errors

| Error Code                | Message                    | Meaning                           | Resolution                         |
| ------------------------- | -------------------------- | --------------------------------- | ---------------------------------- |
| `GROUP_NOT_FOUND`         | Process group not found    | Group ID doesn't exist            | Check group list, verify ID        |
| `GROUP_PROCESS_NOT_FOUND` | Process not in group       | PID not found in specified group  | Verify process is in group         |
| `GROUP_PIPELINE_FAILED`   | Pipeline connection failed | Failed to connect process outputs | Check process compatibility, order |

## Component Documentation

### ConfigLoader

Loads and validates configuration from multiple sources.

**Configuration Priority** (highest to lowest):

1. Provided config object
2. `--config` command line argument
3. `MCP_PROCESS_CONFIG_PATH` environment variable
4. `MCP_PROCESS_CONFIG` environment variable (JSON string)
5. `./mcp-process-config.json`
6. `./config/mcp-process.json`

**Methods**:

```typescript
/**
 * Load configuration from all sources
 * @returns Validated security configuration
 * @throws Error if no valid configuration found
 */
static load(): SecurityConfig;

/**
 * Load configuration from a specific file
 * @param filePath Path to configuration file
 * @returns Validated security configuration
 * @throws Error if file not found or invalid
 */
static loadFromFile(filePath: string): SecurityConfig;

/**
 * Create a sample configuration file
 * @param outputPath Path to write sample config
 */
static createSampleConfig(outputPath: string): void;
```

### ErrorHandler

Creates structured error responses for MCP tools.

**Methods**:

```typescript
/**
 * Create an error response
 * @param code Error code
 * @param message Error message
 * @param details Additional error details
 * @returns Structured error response
 */
static createError(
  code: string,
  message: string,
  details?: any
): {
  status: 'error';
  code: string;
  message: string;
  details?: any;
};

/**
 * Create a success response
 * @param data Response data
 * @returns Structured success response
 */
static createSuccess(data: any): {
  status: 'success';
  data: any;
};
```

### ZombieReaper

Automatically reaps zombie processes.

**Methods**:

```typescript
/**
 * Start the zombie reaper
 * Begins periodic checking for zombie processes
 */
start(): void;

/**
 * Stop the zombie reaper
 */
stop(): void;

/**
 * Manually reap a specific process
 * @param pid Process ID
 */
reapProcess(pid: number): void;
```

## Type Definitions

### SecurityConfig

Complete security configuration interface.

```typescript
interface SecurityConfig {
  // Executable control
  allowedExecutables: string[];
  blockSetuidExecutables: boolean;
  blockShellInterpreters: boolean;
  additionalBlockedExecutables?: string[];

  // Resource limits
  defaultResourceLimits: ResourceLimits;
  maximumResourceLimits?: ResourceLimits;
  strictResourceEnforcement?: boolean;

  // Process limits
  maxConcurrentProcesses: number;
  maxConcurrentProcessesPerAgent?: number;
  maxProcessLifetime: number;
  maxTotalProcesses?: number;

  // Rate limiting
  maxLaunchesPerMinute?: number;
  maxLaunchesPerHour?: number;

  // Permissions
  allowProcessTermination: boolean;
  allowGroupTermination: boolean;
  allowForcedTermination: boolean;
  allowStdinInput: boolean;
  allowOutputCapture: boolean;

  // Audit
  enableAuditLog: boolean;
  auditLogPath?: string;
  auditLogLevel?: "error" | "warn" | "info" | "debug";

  // Confirmation
  requireConfirmation: boolean;
  requireConfirmationFor?: string[];
}
```

### ResourceLimits

Resource limit configuration.

```typescript
interface ResourceLimits {
  maxCpuPercent?: number; // 0-100
  maxMemoryMB?: number; // Megabytes
  maxFileDescriptors?: number; // Number of open files
  maxCpuTime?: number; // Seconds
  maxProcesses?: number; // Process tree size
}
```

### ProcessStats

Process resource usage statistics.

```typescript
interface ProcessStats {
  cpuPercent: number; // CPU usage percentage
  memoryMB: number; // Memory usage in MB
  threadCount: number; // Number of threads
  ioRead: number; // Bytes read
  ioWrite: number; // Bytes written
  uptime: number; // Seconds since start
}
```

## Integration Guide

### Basic Integration

```typescript
import { MCPServer } from "@ai-capabilities-suite/mcp-process";

// Create server with default configuration
const server = new MCPServer();

// Start server
await server.start();

// Server is now listening on stdio
```

### Custom Configuration

```typescript
import { MCPServer, SecurityConfig } from "@ai-capabilities-suite/mcp-process";

const config: SecurityConfig = {
  allowedExecutables: ["node", "python3"],
  defaultResourceLimits: {
    maxCpuPercent: 80,
    maxMemoryMB: 1024,
  },
  maxConcurrentProcesses: 10,
  maxProcessLifetime: 3600,
  enableAuditLog: true,
  blockShellInterpreters: true,
  blockSetuidExecutables: true,
  allowProcessTermination: true,
  allowGroupTermination: true,
  allowForcedTermination: false,
  allowStdinInput: true,
  allowOutputCapture: true,
  requireConfirmation: false,
};

const server = new MCPServer(config);
await server.start();
```

### Graceful Shutdown

```typescript
// Handle shutdown signals
process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await server.stop();
  process.exit(0);
});
```

### Error Handling

```typescript
try {
  await server.start();
} catch (error) {
  if (error.name === "SecurityError") {
    console.error("Security configuration error:", error.message);
  } else {
    console.error("Server error:", error);
  }
  process.exit(1);
}
```

## Support

For technical questions or issues:

- GitHub Issues: <https://github.com/digital-defiance/ai-capabilities-suite/issues>
- Email: <info@digitaldefiance.org>
- Documentation: <https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process>
