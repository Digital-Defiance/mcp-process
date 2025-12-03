/**
 * SecurityManager - Multi-layer security validation for process operations
 *
 * Implements defense-in-depth with 6 layers of executable validation:
 * 1. Resolve executable path
 * 2. Check against dangerous executables (ALWAYS blocked)
 * 3. Check against shell interpreters (if configured)
 * 4. Check for setuid/setgid executables (Unix/Linux only, if configured)
 * 5. Check allowlist
 * 6. Validate arguments for injection attacks
 *
 * Cross-platform support:
 * - Unix/Linux: Blocks setuid/setgid, dangerous system commands
 * - Windows: Blocks runas, reg, diskpart, and other admin tools
 * - macOS: Blocks DYLD injection, dangerous system commands
 */

import * as fs from "fs";
import * as path from "path";
import { sync as whichSync } from "which";
import { minimatch } from "minimatch";
import { SecurityConfig, SecurityError } from "../types";
import { ISecurityManager } from "../interfaces";

export class SecurityManager implements ISecurityManager {
  private allowlist: Set<string>;
  private blockedEnvVars: Set<string>;
  private allowedWorkingDirs: Set<string> | null;
  private config: SecurityConfig;
  private launchCount: Map<string, number[]> = new Map();
  private managedProcesses: Set<number> = new Set();

  // Hardcoded dangerous environment variables (ALWAYS blocked)
  private readonly DANGEROUS_ENV_VARS = [
    // Unix/Linux/macOS
    "LD_PRELOAD",
    "LD_LIBRARY_PATH",
    "DYLD_INSERT_LIBRARIES",
    "DYLD_LIBRARY_PATH",
    "PATH", // Prevent PATH manipulation
    "PYTHONPATH",
    "NODE_PATH",
    "PERL5LIB",
    "RUBYLIB",
    // Windows
    "Path", // Windows uses Path (case-insensitive but we block both)
    "PATHEXT",
    "COMSPEC",
    "PROCESSOR_ARCHITECTURE",
  ];

  // Hardcoded shell interpreters (blocked if blockShellInterpreters=true)
  private readonly SHELL_INTERPRETERS = [
    "bash",
    "sh",
    "zsh",
    "fish",
    "csh",
    "tcsh",
    "ksh",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
  ];

  // Hardcoded dangerous executables (ALWAYS blocked)
  private readonly DANGEROUS_EXECUTABLES = [
    // Unix/Linux
    "sudo",
    "su",
    "doas",
    "chmod",
    "chown",
    "chgrp",
    "rm",
    "rmdir", // Prevent direct file deletion
    "dd", // Prevent disk operations
    "mkfs",
    "fdisk",
    "parted",
    "iptables",
    "nft",
    "systemctl",
    "service",
    "reboot",
    "shutdown",
    "halt",
    // Windows
    "runas.exe",
    "psexec.exe",
    "psexec64.exe",
    "del.exe",
    "erase.exe",
    "format.com",
    "diskpart.exe",
    "bcdedit.exe",
    "reg.exe",
    "regedit.exe",
    "sc.exe",
    "net.exe",
    "netsh.exe",
    "wmic.exe",
    "msiexec.exe",
    "taskkill.exe",
    "shutdown.exe",
  ];

  constructor(config: SecurityConfig) {
    this.config = config;
    this.allowlist = new Set(config.allowedExecutables);

    // Combine hardcoded and user-configured blocked env vars
    this.blockedEnvVars = new Set([
      ...this.DANGEROUS_ENV_VARS,
      ...(config.additionalBlockedEnvVars || []),
    ]);

    // Set up allowed working directories
    if (
      config.allowedWorkingDirectories &&
      config.allowedWorkingDirectories.length > 0
    ) {
      this.allowedWorkingDirs = new Set(
        config.allowedWorkingDirectories.map((d) => path.resolve(d))
      );
    } else {
      this.allowedWorkingDirs = null;
    }

    // Validate allowlist is not empty
    if (this.allowlist.size === 0) {
      throw new Error("Executable allowlist cannot be empty");
    }
  }

  /**
   * Validate an executable against the allowlist with 6-layer validation
   * @param executable Path to executable
   * @param args Command-line arguments
   * @throws SecurityError if validation fails
   */
  validateExecutable(executable: string, args: string[]): void {
    // Layer 1: Resolve executable path
    const resolved = whichSync(executable, { nothrow: true });

    if (!resolved) {
      this.auditSecurityViolation("executable_not_found", executable);
      throw new SecurityError("Executable not found");
    }

    // Layer 2: Check against dangerous executables (ALWAYS blocked)
    const basename = path.basename(resolved);
    if (this.DANGEROUS_EXECUTABLES.includes(basename)) {
      this.auditSecurityViolation("dangerous_executable", executable, resolved);
      throw new SecurityError("Executable is blocked for security reasons");
    }

    // Layer 3: Check against shell interpreters (if configured)
    if (
      this.config.blockShellInterpreters &&
      this.SHELL_INTERPRETERS.includes(basename)
    ) {
      this.auditSecurityViolation("shell_interpreter", executable, resolved);
      throw new SecurityError("Shell interpreters are blocked");
    }

    // Layer 4: Check for setuid/setgid (if configured) - Unix/Linux only
    if (this.config.blockSetuidExecutables && process.platform !== "win32") {
      const stats = fs.statSync(resolved);
      // S_ISUID = 0o4000, S_ISGID = 0o2000 (POSIX standard)
      const S_ISUID = 0o4000;
      const S_ISGID = 0o2000;
      const isSetuid = (stats.mode & S_ISUID) !== 0;
      const isSetgid = (stats.mode & S_ISGID) !== 0;

      if (isSetuid || isSetgid) {
        this.auditSecurityViolation("setuid_executable", executable, resolved);
        throw new SecurityError("Setuid/setgid executables are blocked");
      }
    }

    // Layer 5: Check allowlist
    const isAllowed = Array.from(this.allowlist).some((pattern) => {
      if (pattern.includes("*")) {
        return minimatch(resolved, pattern) || minimatch(basename, pattern);
      }
      return resolved === pattern || basename === pattern;
    });

    if (!isAllowed) {
      this.auditSecurityViolation("not_in_allowlist", executable, resolved);
      throw new SecurityError("Executable not in allowlist");
    }

    // Layer 6: Validate arguments for injection attacks
    this.validateArguments(args);
  }

  /**
   * Validate command-line arguments for injection attacks
   * @param args Command-line arguments
   * @throws SecurityError if validation fails
   */
  validateArguments(args: string[]): void {
    for (const arg of args) {
      // Check for command injection patterns
      if (
        arg.includes("$(") ||
        arg.includes("`") ||
        arg.includes("|") ||
        arg.includes(";") ||
        arg.includes("&") ||
        arg.includes("\n")
      ) {
        this.auditSecurityViolation("argument_injection", arg);
        throw new SecurityError("Argument contains suspicious characters");
      }

      // Check for path traversal in arguments
      if (arg.includes("../") || arg.includes("..\\")) {
        this.auditSecurityViolation("argument_traversal", arg);
        throw new SecurityError("Argument contains path traversal");
      }
    }
  }

  /**
   * Validate working directory
   * @param cwd Working directory path
   * @throws SecurityError if validation fails
   */
  validateWorkingDirectory(cwd: string): void {
    if (!this.allowedWorkingDirs || this.allowedWorkingDirs.size === 0) {
      return; // No restrictions
    }

    const resolved = path.resolve(cwd);
    const isAllowed = Array.from(this.allowedWorkingDirs).some(
      (allowed) =>
        resolved.startsWith(allowed + path.sep) || resolved === allowed
    );

    if (!isAllowed) {
      this.auditSecurityViolation(
        "working_directory_restricted",
        cwd,
        resolved
      );
      throw new SecurityError("Working directory not in allowed list");
    }
  }

  /**
   * Sanitize environment variables
   * @param env Environment variables
   * @returns Sanitized environment variables
   * @throws SecurityError if validation fails
   */
  sanitizeEnvironment(env: Record<string, string>): Record<string, string> {
    const sanitized = { ...env };

    // 1. Remove blocked variables
    for (const blocked of this.blockedEnvVars) {
      if (sanitized[blocked]) {
        delete sanitized[blocked];
        this.auditSecurityViolation("env_var_blocked", blocked);
      }
    }

    // 2. Check for command injection in values
    for (const [key, value] of Object.entries(sanitized)) {
      if (value.includes("$(") || value.includes("`") || value.includes("\n")) {
        this.auditSecurityViolation("env_var_injection", key, value);
        throw new SecurityError(
          `Suspicious environment variable value: ${key}`
        );
      }

      // Check for excessively long values (potential buffer overflow)
      if (value.length > 4096) {
        this.auditSecurityViolation(
          "env_var_too_long",
          key,
          `${value.length} bytes`
        );
        throw new SecurityError(`Environment variable too long: ${key}`);
      }
    }

    // 3. Limit total environment size
    const totalSize = Object.entries(sanitized).reduce(
      (sum, [k, v]) => sum + k.length + v.length,
      0
    );

    if (totalSize > 65536) {
      // 64KB limit
      this.auditSecurityViolation("env_size_exceeded", `${totalSize} bytes`);
      throw new SecurityError("Total environment size exceeds limit");
    }

    return sanitized;
  }

  /**
   * Check if concurrent process limit is reached
   * @throws Error if limit is reached
   */
  checkConcurrentLimit(): void {
    const running = this.managedProcesses.size;

    if (running >= this.config.maxConcurrentProcesses) {
      this.auditSecurityViolation("concurrent_limit", `${running} processes`);
      throw new Error("Maximum concurrent processes reached");
    }
  }

  /**
   * Check if launch rate limit is exceeded
   * @param agentId Agent identifier
   * @throws SecurityError if rate limit exceeded
   */
  checkLaunchRateLimit(agentId: string): void {
    const now = Date.now();
    const launches = this.launchCount.get(agentId) || [];

    // Remove launches older than 1 minute
    const recent = launches.filter((t) => now - t < 60000);

    // Use configured rate limit or default to 10 launches per minute per agent
    const maxLaunches = this.config.maxLaunchesPerMinute || 10;
    if (recent.length >= maxLaunches) {
      this.auditSecurityViolation(
        "launch_rate_limit",
        agentId,
        `${recent.length} launches/min`
      );
      throw new SecurityError("Process launch rate limit exceeded");
    }

    recent.push(now);
    this.launchCount.set(agentId, recent);
  }

  /**
   * Validate signal target
   * @param pid Process ID
   * @throws SecurityError if validation fails
   */
  validateSignalTarget(pid: number): void {
    // Only allow signals to managed processes
    if (!this.managedProcesses.has(pid)) {
      this.auditSecurityViolation("signal_to_unmanaged", pid.toString());
      throw new SecurityError("Cannot send signal to unmanaged process");
    }
  }

  /**
   * Register a managed process
   * @param pid Process ID
   */
  registerProcess(pid: number): void {
    this.managedProcesses.add(pid);
  }

  /**
   * Unregister a managed process
   * @param pid Process ID
   */
  unregisterProcess(pid: number): void {
    this.managedProcesses.delete(pid);
  }

  /**
   * Audit a process operation
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
  ): void {
    if (this.config.enableAuditLog) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "AUDIT",
          operation,
          executable,
          pid,
          result,
        })
      );
    }
  }

  /**
   * Audit a security violation
   * @param type Violation type
   * @param details Additional details
   */
  private auditSecurityViolation(type: string, ...details: string[]): void {
    if (this.config.enableAuditLog) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "SECURITY_VIOLATION",
          type,
          details,
        })
      );
    }
  }
}
