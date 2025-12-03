/**
 * ITimeoutManager - Interface for managing process timeouts
 *
 * Responsibilities:
 * - Track process start times
 * - Enforce timeout limits
 * - Extend timeouts on request
 * - Apply default timeouts
 */

/**
 * Timeout information for a process
 */
export interface TimeoutInfo {
  /** Process ID */
  pid: number;
  /** Start time of the process */
  startTime: Date;
  /** Timeout duration in milliseconds */
  timeoutMs: number;
  /** Timer reference for cleanup */
  timer: NodeJS.Timeout;
  /** Whether the timeout has been triggered */
  triggered: boolean;
}

/**
 * TimeoutManager interface
 */
export interface ITimeoutManager {
  /**
   * Register a process with a timeout
   * @param pid Process ID
   * @param timeoutMs Timeout duration in milliseconds
   * @param onTimeout Callback to execute when timeout is reached
   */
  registerTimeout(
    pid: number,
    timeoutMs: number,
    onTimeout: (pid: number) => void
  ): void;

  /**
   * Extend the timeout for a process
   * @param pid Process ID
   * @param additionalMs Additional milliseconds to add to timeout
   * @throws Error if process timeout not found
   */
  extendTimeout(pid: number, additionalMs: number): void;

  /**
   * Clear the timeout for a process
   * @param pid Process ID
   */
  clearTimeout(pid: number): void;

  /**
   * Get remaining time for a process timeout
   * @param pid Process ID
   * @returns Remaining milliseconds, or undefined if no timeout
   */
  getRemainingTime(pid: number): number | undefined;

  /**
   * Check if a process has exceeded its timeout
   * @param pid Process ID
   * @returns True if timeout exceeded
   */
  hasExceededTimeout(pid: number): boolean;

  /**
   * Get timeout information for a process
   * @param pid Process ID
   * @returns Timeout info or undefined
   */
  getTimeoutInfo(pid: number): TimeoutInfo | undefined;

  /**
   * Clear all timeouts
   */
  clearAll(): void;
}
