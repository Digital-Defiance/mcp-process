/**
 * Core type definitions for MCP Process Server
 */

/**
 * Process state enumeration
 */
export type ProcessState = "running" | "stopped" | "crashed";

/**
 * Resource limits for process execution
 */
export interface ResourceLimits {
  /** Maximum CPU usage percentage (0-100) */
  maxCpuPercent?: number;
  /** Maximum memory usage in megabytes */
  maxMemoryMB?: number;
  /** Maximum number of file descriptors */
  maxFileDescriptors?: number;
  /** Maximum CPU time in seconds */
  maxCpuTime?: number;
  /** Maximum number of processes in process tree */
  maxProcesses?: number;
}

/**
 * Configuration for launching a process
 */
export interface ProcessConfig {
  /** Path to executable */
  executable: string;
  /** Command-line arguments */
  args: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Resource limits */
  resourceLimits?: ResourceLimits;
  /** Whether to capture output */
  captureOutput?: boolean;
  /** Whether to auto-restart on crash */
  autoRestart?: boolean;
}

/**
 * Process statistics
 */
export interface ProcessStats {
  /** CPU usage percentage */
  cpuPercent: number;
  /** Memory usage in megabytes */
  memoryMB: number;
  /** Number of threads */
  threadCount: number;
  /** Bytes read from I/O */
  ioRead: number;
  /** Bytes written to I/O */
  ioWrite: number;
  /** Process uptime in seconds */
  uptime: number;
}

/**
 * Managed process information
 */
export interface ManagedProcess {
  /** Process ID */
  pid: number;
  /** Command that was executed */
  command: string;
  /** Command-line arguments */
  args: string[];
  /** Current process state */
  state: ProcessState;
  /** Process start time */
  startTime: Date;
  /** Exit code (if terminated) */
  exitCode?: number;
  /** Current statistics */
  stats: ProcessStats;
  /** Buffered stdout data */
  outputBuffer: Buffer[];
  /** Buffered stderr data */
  errorBuffer: Buffer[];
}

/**
 * Process group information
 */
export interface ProcessGroup {
  /** Group identifier */
  id: string;
  /** Group name */
  name: string;
  /** PIDs of processes in the group */
  processes: number[];
  /** Whether this is a pipeline group */
  pipeline?: boolean;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  /** Command to execute for health check */
  command: string;
  /** Interval between health checks in milliseconds */
  interval: number;
  /** Timeout for health check execution in milliseconds */
  timeout: number;
}

/**
 * Restart policy configuration
 */
export interface RestartPolicy {
  /** Whether auto-restart is enabled */
  enabled: boolean;
  /** Maximum number of restart attempts */
  maxRetries: number;
  /** Backoff delay in milliseconds */
  backoffMs: number;
}

/**
 * Service configuration
 */
export interface ServiceConfig extends ProcessConfig {
  /** Service name */
  name: string;
  /** Health check configuration */
  healthCheck?: HealthCheckConfig;
  /** Restart policy */
  restartPolicy: RestartPolicy;
}

/**
 * Security configuration - Enterprise-grade fine-grained controls
 */
export interface SecurityConfig {
  // === EXECUTABLE CONTROL ===
  /** List of allowed executables (paths, basenames, or glob patterns) */
  allowedExecutables: string[];
  /** Block setuid/setgid executables (Unix/Linux) */
  blockSetuidExecutables: boolean;
  /** Block shell interpreters (bash, sh, cmd.exe, powershell, etc.) */
  blockShellInterpreters: boolean;
  /** Additional blocked executables beyond hardcoded dangerous list */
  additionalBlockedExecutables?: string[];

  // === ARGUMENT CONTROL ===
  /** Maximum number of arguments per process */
  maxArgumentCount?: number;
  /** Maximum length of any single argument */
  maxArgumentLength?: number;
  /** Regex patterns to block in arguments */
  blockedArgumentPatterns?: string[];

  // === ENVIRONMENT CONTROL ===
  /** Additional blocked environment variables beyond hardcoded list */
  additionalBlockedEnvVars?: string[];
  /** Allowed environment variables (if set, only these are permitted) */
  allowedEnvVars?: string[];
  /** Maximum number of environment variables */
  maxEnvVarCount?: number;

  // === WORKING DIRECTORY CONTROL ===
  /** Allowed working directories (empty = any allowed) */
  allowedWorkingDirectories?: string[];
  /** Blocked working directories (takes precedence over allowed) */
  blockedWorkingDirectories?: string[];

  // === RESOURCE LIMITS ===
  /** Default resource limits applied to all processes */
  defaultResourceLimits: ResourceLimits;
  /** Maximum resource limits (cannot be exceeded even if requested) */
  maximumResourceLimits?: ResourceLimits;
  /** Enforce resource limits strictly (terminate immediately on violation) */
  strictResourceEnforcement?: boolean;

  // === PROCESS LIMITS ===
  /** Maximum concurrent processes across all agents */
  maxConcurrentProcesses: number;
  /** Maximum concurrent processes per agent */
  maxConcurrentProcessesPerAgent?: number;
  /** Maximum process lifetime in seconds */
  maxProcessLifetime: number;
  /** Maximum total processes that can be launched (lifetime of server) */
  maxTotalProcesses?: number;

  // === RATE LIMITING ===
  /** Maximum process launches per minute per agent */
  maxLaunchesPerMinute?: number;
  /** Maximum process launches per hour per agent */
  maxLaunchesPerHour?: number;
  /** Cooldown period in seconds after rate limit hit */
  rateLimitCooldownSeconds?: number;

  // === TERMINATION CONTROL ===
  /** Allow agents to terminate processes they created */
  allowProcessTermination: boolean;
  /** Allow agents to terminate process groups */
  allowGroupTermination: boolean;
  /** Allow forced termination (SIGKILL) */
  allowForcedTermination: boolean;
  /** Require confirmation before termination */
  requireTerminationConfirmation?: boolean;

  // === I/O CONTROL ===
  /** Allow stdin input to processes */
  allowStdinInput: boolean;
  /** Allow stdout/stderr capture */
  allowOutputCapture: boolean;
  /** Maximum output buffer size per stream (bytes) */
  maxOutputBufferSize?: number;
  /** Block binary data in stdin */
  blockBinaryStdin?: boolean;

  // === ISOLATION (Unix/Linux) ===
  /** Enable chroot jail for processes */
  enableChroot?: boolean;
  /** Chroot directory path */
  chrootDirectory?: string;
  /** Enable Linux namespaces (PID, network, mount, etc.) */
  enableNamespaces?: boolean;
  /** Specific namespaces to enable */
  namespaces?: {
    pid?: boolean;
    network?: boolean;
    mount?: boolean;
    uts?: boolean;
    ipc?: boolean;
    user?: boolean;
  };
  /** Enable seccomp filtering (syscall restrictions) */
  enableSeccomp?: boolean;
  /** Seccomp profile (strict, moderate, permissive) */
  seccompProfile?: "strict" | "moderate" | "permissive";

  // === NETWORK CONTROL ===
  /** Block network access for spawned processes */
  blockNetworkAccess?: boolean;
  /** Allowed network destinations (IP/CIDR or hostnames) */
  allowedNetworkDestinations?: string[];
  /** Blocked network destinations */
  blockedNetworkDestinations?: string[];

  // === AUDIT & MONITORING ===
  /** Enable audit logging */
  enableAuditLog: boolean;
  /** Audit log file path */
  auditLogPath?: string;
  /** Log level (error, warn, info, debug) */
  auditLogLevel?: "error" | "warn" | "info" | "debug";
  /** Enable real-time security alerts */
  enableSecurityAlerts?: boolean;
  /** Alert webhook URL for security violations */
  securityAlertWebhook?: string;

  // === CONFIRMATION & APPROVAL ===
  /** Require explicit confirmation for process launches */
  requireConfirmation: boolean;
  /** Require confirmation for specific executables */
  requireConfirmationFor?: string[];
  /** Auto-approve after N successful launches of same command */
  autoApproveAfterCount?: number;

  // === TIME RESTRICTIONS ===
  /** Allowed time windows for process launches (cron-like) */
  allowedTimeWindows?: string[];
  /** Blocked time windows (maintenance windows, etc.) */
  blockedTimeWindows?: string[];

  // === ADVANCED SECURITY ===
  /** Enable mandatory access control (SELinux/AppArmor) */
  enableMAC?: boolean;
  /** SELinux context or AppArmor profile */
  macProfile?: string;
  /** Drop capabilities (Linux capabilities to drop) */
  dropCapabilities?: string[];
  /** Read-only filesystem for processes */
  readOnlyFilesystem?: boolean;
  /** Temporary filesystem size limit (MB) */
  tmpfsSize?: number;
}

/**
 * Security error class
 */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Process error class
 */
export class ProcessError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "ProcessError";
  }
}
