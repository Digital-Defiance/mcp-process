/**
 * ErrorHandler - Centralized error handling and response formatting
 *
 * Provides structured error responses with error codes, clear messages,
 * and suggested remediation for all process operations.
 *
 * Validates: Requirements 12.1-12.5, 13.2
 */

import { ProcessError, SecurityError } from "../types";

/**
 * Error codes for different error types
 */
export enum ErrorCode {
  // Process errors
  PROCESS_NOT_FOUND = "PROCESS_NOT_FOUND",
  PROCESS_NOT_RUNNING = "PROCESS_NOT_RUNNING",
  PROCESS_ALREADY_RUNNING = "PROCESS_ALREADY_RUNNING",
  CHILD_PROCESS_NOT_FOUND = "CHILD_PROCESS_NOT_FOUND",

  // Spawn errors
  SPAWN_FAILED = "SPAWN_FAILED",
  EXECUTABLE_NOT_FOUND = "EXECUTABLE_NOT_FOUND",
  INVALID_EXECUTABLE = "INVALID_EXECUTABLE",

  // Permission errors
  PERMISSION_DENIED = "PERMISSION_DENIED",
  SECURITY_VIOLATION = "SECURITY_VIOLATION",
  NOT_IN_ALLOWLIST = "NOT_IN_ALLOWLIST",
  DANGEROUS_EXECUTABLE = "DANGEROUS_EXECUTABLE",
  SETUID_BLOCKED = "SETUID_BLOCKED",
  SHELL_BLOCKED = "SHELL_BLOCKED",

  // Validation errors
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  ARGUMENT_INJECTION = "ARGUMENT_INJECTION",
  ARGUMENT_TRAVERSAL = "ARGUMENT_TRAVERSAL",
  INVALID_WORKING_DIRECTORY = "INVALID_WORKING_DIRECTORY",
  WORKING_DIRECTORY_RESTRICTED = "WORKING_DIRECTORY_RESTRICTED",
  INVALID_ENVIRONMENT = "INVALID_ENVIRONMENT",
  ENV_VAR_BLOCKED = "ENV_VAR_BLOCKED",
  ENV_VAR_INJECTION = "ENV_VAR_INJECTION",
  ENV_VAR_TOO_LONG = "ENV_VAR_TOO_LONG",
  ENV_SIZE_EXCEEDED = "ENV_SIZE_EXCEEDED",

  // Resource errors
  RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
  CPU_LIMIT_EXCEEDED = "CPU_LIMIT_EXCEEDED",
  MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED",
  CPU_TIME_LIMIT_EXCEEDED = "CPU_TIME_LIMIT_EXCEEDED",
  CONCURRENT_LIMIT_EXCEEDED = "CONCURRENT_LIMIT_EXCEEDED",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  LIFETIME_EXCEEDED = "LIFETIME_EXCEEDED",

  // I/O errors
  STDIN_NOT_AVAILABLE = "STDIN_NOT_AVAILABLE",
  STDIN_NOT_WRITABLE = "STDIN_NOT_WRITABLE",
  STDIN_WRITE_FAILED = "STDIN_WRITE_FAILED",
  OUTPUT_CAPTURE_FAILED = "OUTPUT_CAPTURE_FAILED",

  // Termination errors
  TERMINATION_FAILED = "TERMINATION_FAILED",
  SIGNAL_FAILED = "SIGNAL_FAILED",
  TIMEOUT_EXCEEDED = "TIMEOUT_EXCEEDED",
  SIGNAL_TO_UNMANAGED = "SIGNAL_TO_UNMANAGED",

  // Group errors
  GROUP_NOT_FOUND = "GROUP_NOT_FOUND",
  GROUP_ALREADY_EXISTS = "GROUP_ALREADY_EXISTS",
  INVALID_GROUP = "INVALID_GROUP",

  // Service errors
  SERVICE_NOT_FOUND = "SERVICE_NOT_FOUND",
  SERVICE_EXISTS = "SERVICE_EXISTS",
  SERVICE_START_FAILED = "SERVICE_START_FAILED",
  SERVICE_STOP_FAILED = "SERVICE_STOP_FAILED",
  HEALTH_CHECK_FAILED = "HEALTH_CHECK_FAILED",

  // Timeout errors
  TIMEOUT_NOT_FOUND = "TIMEOUT_NOT_FOUND",
  TIMEOUT_ALREADY_TRIGGERED = "TIMEOUT_ALREADY_TRIGGERED",
  INVALID_TIMEOUT = "INVALID_TIMEOUT",

  // Zombie process errors
  ZOMBIE_PROCESS = "ZOMBIE_PROCESS",
  ZOMBIE_REAP_FAILED = "ZOMBIE_REAP_FAILED",

  // Resource exhaustion
  OUT_OF_MEMORY = "OUT_OF_MEMORY",
  OUT_OF_FILE_DESCRIPTORS = "OUT_OF_FILE_DESCRIPTORS",
  SYSTEM_RESOURCE_EXHAUSTED = "SYSTEM_RESOURCE_EXHAUSTED",

  // Configuration errors
  INVALID_CONFIGURATION = "INVALID_CONFIGURATION",
  CONFIGURATION_NOT_FOUND = "CONFIGURATION_NOT_FOUND",

  // Manager errors
  TIMEOUT_MANAGER_NOT_AVAILABLE = "TIMEOUT_MANAGER_NOT_AVAILABLE",
  PROCESS_MANAGER_NOT_AVAILABLE = "PROCESS_MANAGER_NOT_AVAILABLE",

  // Unknown errors
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Structured error response
 */
export interface ErrorResponse {
  /** Status indicator (always "error") */
  status: "error";
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Suggested remediation steps */
  remediation?: string;
  /** Additional error details */
  details?: Record<string, any>;
  /** Timestamp of the error */
  timestamp: string;
}

/**
 * ErrorHandler class
 * Provides centralized error handling and response formatting
 */
export class ErrorHandler {
  /**
   * Format an error into a structured error response
   */
  static formatError(error: Error | unknown): ErrorResponse {
    const timestamp = new Date().toISOString();

    // Handle ProcessError
    if (error instanceof ProcessError) {
      return {
        status: "error",
        code: error.code || ErrorCode.UNKNOWN_ERROR,
        message: error.message,
        remediation: this.getRemediation(error.code || ErrorCode.UNKNOWN_ERROR),
        timestamp,
      };
    }

    // Handle SecurityError
    if (error instanceof SecurityError) {
      return {
        status: "error",
        code: ErrorCode.SECURITY_VIOLATION,
        message: error.message,
        remediation: this.getRemediation(ErrorCode.SECURITY_VIOLATION),
        timestamp,
      };
    }

    // Handle standard Error
    if (error instanceof Error) {
      // Try to infer error code from message
      const code = this.inferErrorCode(error.message);

      return {
        status: "error",
        code,
        message: error.message,
        remediation: this.getRemediation(code),
        timestamp,
      };
    }

    // Handle unknown error types
    return {
      status: "error",
      code: ErrorCode.UNKNOWN_ERROR,
      message: String(error),
      remediation: this.getRemediation(ErrorCode.UNKNOWN_ERROR),
      timestamp,
    };
  }

  /**
   * Handle spawn errors
   */
  static handleSpawnError(error: Error, executable: string): ErrorResponse {
    const message = error.message.toLowerCase();

    // Check for common spawn error patterns
    if (message.includes("enoent") || message.includes("not found")) {
      return {
        status: "error",
        code: ErrorCode.EXECUTABLE_NOT_FOUND,
        message: `Executable not found: ${executable}`,
        remediation:
          "Verify the executable path is correct and the file exists. Check if the executable is in your PATH.",
        details: { executable, originalError: error.message },
        timestamp: new Date().toISOString(),
      };
    }

    if (message.includes("eacces") || message.includes("permission denied")) {
      return {
        status: "error",
        code: ErrorCode.PERMISSION_DENIED,
        message: `Permission denied: ${executable}`,
        remediation:
          "Ensure the executable has execute permissions (chmod +x) and you have permission to run it.",
        details: { executable, originalError: error.message },
        timestamp: new Date().toISOString(),
      };
    }

    if (message.includes("emfile") || message.includes("too many open files")) {
      return {
        status: "error",
        code: ErrorCode.OUT_OF_FILE_DESCRIPTORS,
        message: "Too many open files",
        remediation:
          "Close some processes or increase the file descriptor limit (ulimit -n).",
        details: { executable, originalError: error.message },
        timestamp: new Date().toISOString(),
      };
    }

    if (message.includes("enomem") || message.includes("out of memory")) {
      return {
        status: "error",
        code: ErrorCode.OUT_OF_MEMORY,
        message: "Out of memory",
        remediation:
          "Free up system memory by closing other processes or increase available memory.",
        details: { executable, originalError: error.message },
        timestamp: new Date().toISOString(),
      };
    }

    // Generic spawn failure
    return {
      status: "error",
      code: ErrorCode.SPAWN_FAILED,
      message: `Failed to spawn process: ${error.message}`,
      remediation:
        "Check the executable path, permissions, and system resources. Review the error details for more information.",
      details: { executable, originalError: error.message },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle permission errors
   */
  static handlePermissionError(
    operation: string,
    resource: string,
    reason?: string
  ): ErrorResponse {
    return {
      status: "error",
      code: ErrorCode.PERMISSION_DENIED,
      message: `Permission denied: ${operation} on ${resource}`,
      remediation: reason || "Verify you have the necessary permissions.",
      details: { operation, resource },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    field: string,
    value: any,
    reason: string
  ): ErrorResponse {
    return {
      status: "error",
      code: ErrorCode.INVALID_ARGUMENT,
      message: `Invalid ${field}: ${reason}`,
      remediation: `Correct the ${field} value and try again.`,
      details: { field, value, reason },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle resource limit errors
   */
  static handleResourceLimitError(
    limitType: string,
    current: number,
    limit: number,
    pid?: number
  ): ErrorResponse {
    const code = this.getResourceLimitErrorCode(limitType);

    return {
      status: "error",
      code,
      message: `${limitType} limit exceeded: ${current} > ${limit}`,
      remediation: `Reduce ${limitType} usage or increase the limit. The process has been terminated.`,
      details: { limitType, current, limit, pid },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle process crash errors
   */
  static handleProcessCrash(
    pid: number,
    exitCode: number | null,
    signal: string | null
  ): ErrorResponse {
    const message = signal
      ? `Process ${pid} crashed with signal ${signal}`
      : `Process ${pid} crashed with exit code ${exitCode}`;

    return {
      status: "error",
      code: ErrorCode.PROCESS_NOT_RUNNING,
      message,
      remediation:
        "Check the process output for error messages. The process may have encountered a fatal error.",
      details: { pid, exitCode, signal },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle zombie process errors
   */
  static handleZombieProcess(pid: number): ErrorResponse {
    return {
      status: "error",
      code: ErrorCode.ZOMBIE_PROCESS,
      message: `Process ${pid} is a zombie process`,
      remediation:
        "The process has terminated but has not been reaped. The system will attempt to clean it up.",
      details: { pid },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle resource exhaustion errors
   */
  static handleResourceExhaustion(
    resource: string,
    details?: string
  ): ErrorResponse {
    return {
      status: "error",
      code: ErrorCode.SYSTEM_RESOURCE_EXHAUSTED,
      message: `System resource exhausted: ${resource}`,
      remediation: `Free up ${resource} by closing other processes or increasing system limits. ${
        details || ""
      }`,
      details: { resource },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get remediation advice for an error code
   */
  private static getRemediation(code: string): string {
    const remediations: Record<string, string> = {
      [ErrorCode.PROCESS_NOT_FOUND]:
        "Verify the process ID is correct. The process may have already terminated.",
      [ErrorCode.PROCESS_NOT_RUNNING]:
        "The process is not currently running. Check the process status.",
      [ErrorCode.SPAWN_FAILED]:
        "Check the executable path, permissions, and system resources.",
      [ErrorCode.EXECUTABLE_NOT_FOUND]:
        "Verify the executable path is correct and the file exists.",
      [ErrorCode.PERMISSION_DENIED]:
        "Ensure you have the necessary permissions to perform this operation.",
      [ErrorCode.SECURITY_VIOLATION]:
        "This operation violates security policies. Check the allowlist and security configuration.",
      [ErrorCode.NOT_IN_ALLOWLIST]:
        "The executable is not in the allowlist. Add it to the configuration or use an allowed executable.",
      [ErrorCode.DANGEROUS_EXECUTABLE]:
        "This executable is blocked for security reasons and cannot be launched.",
      [ErrorCode.SETUID_BLOCKED]:
        "Setuid/setgid executables are blocked by security policy.",
      [ErrorCode.SHELL_BLOCKED]:
        "Shell interpreters are blocked by security policy.",
      [ErrorCode.ARGUMENT_INJECTION]:
        "The arguments contain suspicious characters that may indicate command injection.",
      [ErrorCode.ARGUMENT_TRAVERSAL]:
        "The arguments contain path traversal patterns.",
      [ErrorCode.ENV_VAR_BLOCKED]:
        "One or more environment variables are blocked by security policy.",
      [ErrorCode.ENV_VAR_INJECTION]:
        "Environment variable values contain suspicious characters.",
      [ErrorCode.WORKING_DIRECTORY_RESTRICTED]:
        "The working directory is not in the allowed list.",
      [ErrorCode.CPU_LIMIT_EXCEEDED]:
        "The process exceeded the CPU usage limit and was terminated.",
      [ErrorCode.MEMORY_LIMIT_EXCEEDED]:
        "The process exceeded the memory limit and was terminated.",
      [ErrorCode.CPU_TIME_LIMIT_EXCEEDED]:
        "The process exceeded the CPU time limit and was terminated.",
      [ErrorCode.CONCURRENT_LIMIT_EXCEEDED]:
        "Maximum concurrent processes reached. Terminate some processes before launching new ones.",
      [ErrorCode.RATE_LIMIT_EXCEEDED]:
        "Process launch rate limit exceeded. Wait before launching more processes.",
      [ErrorCode.STDIN_NOT_AVAILABLE]:
        "The process stdin is not available. The process may not support stdin input.",
      [ErrorCode.STDIN_NOT_WRITABLE]:
        "The process stdin is not writable. It may have been closed.",
      [ErrorCode.TERMINATION_FAILED]:
        "Failed to terminate the process. Try forced termination.",
      [ErrorCode.TIMEOUT_EXCEEDED]:
        "The process exceeded its timeout and was terminated.",
      [ErrorCode.GROUP_NOT_FOUND]:
        "The process group was not found. Verify the group ID.",
      [ErrorCode.SERVICE_NOT_FOUND]:
        "The service was not found. Verify the service ID.",
      [ErrorCode.ZOMBIE_PROCESS]:
        "The process is a zombie. The system will attempt to reap it.",
      [ErrorCode.OUT_OF_MEMORY]:
        "System is out of memory. Free up memory by closing other processes.",
      [ErrorCode.OUT_OF_FILE_DESCRIPTORS]:
        "Too many open files. Close some processes or increase the file descriptor limit.",
      [ErrorCode.SYSTEM_RESOURCE_EXHAUSTED]:
        "System resources are exhausted. Free up resources before continuing.",
      [ErrorCode.UNKNOWN_ERROR]:
        "An unknown error occurred. Check the error message for details.",
    };

    return remediations[code] || "No specific remediation available.";
  }

  /**
   * Infer error code from error message
   */
  private static inferErrorCode(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("not found")) {
      if (lowerMessage.includes("process")) return ErrorCode.PROCESS_NOT_FOUND;
      if (lowerMessage.includes("group")) return ErrorCode.GROUP_NOT_FOUND;
      if (lowerMessage.includes("service")) return ErrorCode.SERVICE_NOT_FOUND;
      if (lowerMessage.includes("executable"))
        return ErrorCode.EXECUTABLE_NOT_FOUND;
    }

    if (
      lowerMessage.includes("permission") ||
      lowerMessage.includes("denied")
    ) {
      return ErrorCode.PERMISSION_DENIED;
    }

    if (lowerMessage.includes("security") || lowerMessage.includes("blocked")) {
      return ErrorCode.SECURITY_VIOLATION;
    }

    if (lowerMessage.includes("limit") || lowerMessage.includes("exceeded")) {
      if (lowerMessage.includes("cpu")) return ErrorCode.CPU_LIMIT_EXCEEDED;
      if (lowerMessage.includes("memory"))
        return ErrorCode.MEMORY_LIMIT_EXCEEDED;
      if (lowerMessage.includes("rate")) return ErrorCode.RATE_LIMIT_EXCEEDED;
      return ErrorCode.RESOURCE_LIMIT_EXCEEDED;
    }

    if (lowerMessage.includes("timeout")) {
      return ErrorCode.TIMEOUT_EXCEEDED;
    }

    if (lowerMessage.includes("zombie")) {
      return ErrorCode.ZOMBIE_PROCESS;
    }

    if (lowerMessage.includes("spawn") || lowerMessage.includes("launch")) {
      return ErrorCode.SPAWN_FAILED;
    }

    return ErrorCode.UNKNOWN_ERROR;
  }

  /**
   * Get specific error code for resource limit type
   */
  private static getResourceLimitErrorCode(limitType: string): string {
    const lowerType = limitType.toLowerCase();

    if (lowerType.includes("cpu") && !lowerType.includes("time")) {
      return ErrorCode.CPU_LIMIT_EXCEEDED;
    }

    if (lowerType.includes("memory")) {
      return ErrorCode.MEMORY_LIMIT_EXCEEDED;
    }

    if (lowerType.includes("cpu") && lowerType.includes("time")) {
      return ErrorCode.CPU_TIME_LIMIT_EXCEEDED;
    }

    if (lowerType.includes("concurrent")) {
      return ErrorCode.CONCURRENT_LIMIT_EXCEEDED;
    }

    return ErrorCode.RESOURCE_LIMIT_EXCEEDED;
  }

  /**
   * Wrap a function with error handling
   */
  static async wrapAsync<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Add context to error if provided
      if (context && error instanceof Error) {
        error.message = `${context}: ${error.message}`;
      }
      throw error;
    }
  }

  /**
   * Wrap a synchronous function with error handling
   */
  static wrap<T>(fn: () => T, context?: string): T {
    try {
      return fn();
    } catch (error) {
      // Add context to error if provided
      if (context && error instanceof Error) {
        error.message = `${context}: ${error.message}`;
      }
      throw error;
    }
  }
}
