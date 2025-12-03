/**
 * TimeoutManager - Manages process execution timeouts
 *
 * Responsibilities:
 * - Track process start times
 * - Enforce timeout limits
 * - Extend timeouts on request
 * - Apply default timeouts
 * - Terminate processes exceeding timeout
 */

import { ITimeoutManager, TimeoutInfo } from "../interfaces/ITimeoutManager";
import { ProcessError } from "../types";

/**
 * Extended timeout info with callback
 */
interface ExtendedTimeoutInfo extends TimeoutInfo {
  onTimeout: (pid: number) => void;
}

/**
 * TimeoutManager implementation
 * Tracks and enforces process execution timeouts
 */
export class TimeoutManager implements ITimeoutManager {
  private timeouts: Map<number, ExtendedTimeoutInfo> = new Map();
  private defaultTimeoutMs: number;

  /**
   * Create a new TimeoutManager
   * @param defaultTimeoutMs Default timeout in milliseconds (default: 5 minutes)
   */
  constructor(defaultTimeoutMs: number = 300000) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Register a process with a timeout
   * @param pid Process ID
   * @param timeoutMs Timeout duration in milliseconds (0 = use default)
   * @param onTimeout Callback to execute when timeout is reached
   */
  registerTimeout(
    pid: number,
    timeoutMs: number,
    onTimeout: (pid: number) => void
  ): void {
    // Clear any existing timeout for this PID
    this.clearTimeout(pid);

    // Use default timeout if 0 or not specified
    const effectiveTimeout = timeoutMs > 0 ? timeoutMs : this.defaultTimeoutMs;

    const startTime = new Date();

    // Create timer that will trigger the timeout
    const timer = setTimeout(() => {
      const info = this.timeouts.get(pid);
      if (info) {
        info.triggered = true;
        info.onTimeout(pid);
      }
    }, effectiveTimeout);

    // Store timeout information
    const timeoutInfo: ExtendedTimeoutInfo = {
      pid,
      startTime,
      timeoutMs: effectiveTimeout,
      timer,
      triggered: false,
      onTimeout,
    };

    this.timeouts.set(pid, timeoutInfo);
  }

  /**
   * Extend the timeout for a process
   * @param pid Process ID
   * @param additionalMs Additional milliseconds to add to timeout
   * @throws Error if process timeout not found
   */
  extendTimeout(pid: number, additionalMs: number): void {
    const info = this.timeouts.get(pid);
    if (!info) {
      throw new ProcessError(
        `Cannot extend timeout: process ${pid} not found`,
        "TIMEOUT_NOT_FOUND"
      );
    }

    if (info.triggered) {
      throw new ProcessError(
        `Cannot extend timeout: process ${pid} has already timed out`,
        "TIMEOUT_ALREADY_TRIGGERED"
      );
    }

    // Clear the existing timer
    clearTimeout(info.timer);

    // Calculate remaining time
    const elapsed = Date.now() - info.startTime.getTime();
    const remaining = info.timeoutMs - elapsed;

    // Create new timeout with extended duration
    const newTimeoutMs = remaining + additionalMs;

    // Create new timer with the original callback
    const timer = setTimeout(() => {
      const currentInfo = this.timeouts.get(pid);
      if (currentInfo) {
        currentInfo.triggered = true;
        currentInfo.onTimeout(pid);
      }
    }, newTimeoutMs);

    // Update timeout info
    info.timer = timer;
    info.timeoutMs = elapsed + newTimeoutMs;
  }

  /**
   * Clear the timeout for a process
   * @param pid Process ID
   */
  clearTimeout(pid: number): void {
    const info = this.timeouts.get(pid);
    if (info) {
      clearTimeout(info.timer);
      this.timeouts.delete(pid);
    }
  }

  /**
   * Get remaining time for a process timeout
   * @param pid Process ID
   * @returns Remaining milliseconds, or undefined if no timeout
   */
  getRemainingTime(pid: number): number | undefined {
    const info = this.timeouts.get(pid);
    if (!info) {
      return undefined;
    }

    if (info.triggered) {
      return 0;
    }

    const elapsed = Date.now() - info.startTime.getTime();
    const remaining = info.timeoutMs - elapsed;

    return Math.max(0, remaining);
  }

  /**
   * Check if a process has exceeded its timeout
   * @param pid Process ID
   * @returns True if timeout exceeded
   */
  hasExceededTimeout(pid: number): boolean {
    const info = this.timeouts.get(pid);
    if (!info) {
      return false;
    }

    if (info.triggered) {
      return true;
    }

    const elapsed = Date.now() - info.startTime.getTime();
    return elapsed >= info.timeoutMs;
  }

  /**
   * Get timeout information for a process
   * @param pid Process ID
   * @returns Timeout info or undefined
   */
  getTimeoutInfo(pid: number): TimeoutInfo | undefined {
    return this.timeouts.get(pid);
  }

  /**
   * Clear all timeouts
   */
  clearAll(): void {
    for (const info of this.timeouts.values()) {
      clearTimeout(info.timer);
    }
    this.timeouts.clear();
  }

  /**
   * Get the default timeout duration
   * @returns Default timeout in milliseconds
   */
  getDefaultTimeout(): number {
    return this.defaultTimeoutMs;
  }

  /**
   * Set the default timeout duration
   * @param timeoutMs New default timeout in milliseconds
   */
  setDefaultTimeout(timeoutMs: number): void {
    if (timeoutMs <= 0) {
      throw new ProcessError(
        "Default timeout must be greater than 0",
        "INVALID_TIMEOUT"
      );
    }
    this.defaultTimeoutMs = timeoutMs;
  }
}
