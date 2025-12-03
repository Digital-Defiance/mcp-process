/**
 * Interface for security management functionality
 */

import { SecurityConfig } from "../types";

export interface ISecurityManager {
  /**
   * Validate an executable against the allowlist
   * @param executable Path to executable
   * @param args Command-line arguments
   * @throws SecurityError if validation fails
   */
  validateExecutable(executable: string, args: string[]): void;

  /**
   * Validate command-line arguments for injection attacks
   * @param args Command-line arguments
   * @throws SecurityError if validation fails
   */
  validateArguments(args: string[]): void;

  /**
   * Validate working directory
   * @param cwd Working directory path
   * @throws SecurityError if validation fails
   */
  validateWorkingDirectory(cwd: string): void;

  /**
   * Sanitize environment variables
   * @param env Environment variables
   * @returns Sanitized environment variables
   * @throws SecurityError if validation fails
   */
  sanitizeEnvironment(env: Record<string, string>): Record<string, string>;

  /**
   * Check if concurrent process limit is reached
   * @throws Error if limit is reached
   */
  checkConcurrentLimit(): void;

  /**
   * Check if launch rate limit is exceeded
   * @param agentId Agent identifier
   * @throws SecurityError if rate limit exceeded
   */
  checkLaunchRateLimit(agentId: string): void;

  /**
   * Validate signal target
   * @param pid Process ID
   * @throws SecurityError if validation fails
   */
  validateSignalTarget(pid: number): void;

  /**
   * Register a process for tracking
   * @param pid Process ID
   */
  registerProcess(pid: number): void;

  /**
   * Unregister a process from tracking
   * @param pid Process ID
   */
  unregisterProcess(pid: number): void;

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
  ): void;
}
