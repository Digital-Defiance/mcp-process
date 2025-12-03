/**
 * Interface for process termination functionality
 */

export interface TerminationResult {
  /** Process ID that was terminated */
  pid: number;
  /** Exit code if available */
  exitCode?: number;
  /** Termination reason */
  reason: "graceful" | "forced" | "timeout";
  /** Whether termination was successful */
  success: boolean;
}

export interface IProcessTerminator {
  /**
   * Terminate a process gracefully (SIGTERM)
   * @param pid Process ID
   * @param timeout Timeout in milliseconds before escalating to SIGKILL
   * @returns Termination result
   */
  terminateGracefully(
    pid: number,
    timeout?: number
  ): Promise<TerminationResult>;

  /**
   * Terminate a process forcefully (SIGKILL)
   * @param pid Process ID
   * @returns Termination result
   */
  terminateForcefully(pid: number): Promise<TerminationResult>;

  /**
   * Terminate a process group
   * @param pids Array of process IDs
   * @param force Whether to use forced termination
   * @param timeout Timeout for graceful termination
   * @returns Array of termination results
   */
  terminateGroup(
    pids: number[],
    force?: boolean,
    timeout?: number
  ): Promise<TerminationResult[]>;
}
