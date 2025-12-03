/**
 * ProcessTerminator - Handles process termination
 *
 * Responsibilities:
 * - Implement graceful termination (SIGTERM)
 * - Implement forced termination (SIGKILL)
 * - Implement timeout escalation
 * - Handle process groups
 */

import { IProcessTerminator, TerminationResult } from "../interfaces";
import { IProcessLauncher } from "../interfaces";
import { ISecurityManager } from "../interfaces";
import { IProcessManager } from "../interfaces";
import { ProcessError } from "../types";

export class ProcessTerminator implements IProcessTerminator {
  private processLauncher: IProcessLauncher;
  private securityManager: ISecurityManager;
  private processManager?: IProcessManager;

  constructor(
    processLauncher: IProcessLauncher,
    securityManager: ISecurityManager,
    processManager?: IProcessManager
  ) {
    this.processLauncher = processLauncher;
    this.securityManager = securityManager;
    this.processManager = processManager;
  }

  /**
   * Terminate a process gracefully (SIGTERM)
   * Waits for the process to exit, escalating to SIGKILL if timeout is exceeded
   * @param pid Process ID
   * @param timeout Timeout in milliseconds before escalating to SIGKILL (default: 5000ms)
   * @returns Termination result
   */
  async terminateGracefully(
    pid: number,
    timeout: number = 5000
  ): Promise<TerminationResult> {
    // Validate that we can terminate this process
    this.securityManager.validateSignalTarget(pid);

    // Check if process exists
    const managed = this.processLauncher.getProcess(pid);
    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    // If already stopped, return immediately
    if (managed.state !== "running") {
      return {
        pid,
        exitCode: managed.exitCode,
        reason: "graceful",
        success: true,
      };
    }

    try {
      // Send SIGTERM signal
      process.kill(pid, "SIGTERM");

      // Wait for process to exit or timeout
      const exitedGracefully = await this.waitForExit(pid, timeout);

      if (exitedGracefully) {
        // Process exited gracefully
        const updatedManaged = this.processLauncher.getProcess(pid);
        this.securityManager.auditOperation(
          "process_terminate",
          managed.command,
          pid,
          "graceful_success"
        );

        return {
          pid,
          exitCode: updatedManaged?.exitCode,
          reason: "graceful",
          success: true,
        };
      } else {
        // Timeout - escalate to SIGKILL
        process.kill(pid, "SIGKILL");

        // Wait a bit for SIGKILL to take effect
        await this.waitForExit(pid, 1000);

        const updatedManaged = this.processLauncher.getProcess(pid);
        this.securityManager.auditOperation(
          "process_terminate",
          managed.command,
          pid,
          "timeout_escalated_to_sigkill"
        );

        return {
          pid,
          exitCode: updatedManaged?.exitCode,
          reason: "timeout",
          success: true,
        };
      }
    } catch (error) {
      // Process may have already exited
      if (
        error instanceof Error &&
        (error.message.includes("ESRCH") || error.message.includes("no such"))
      ) {
        const updatedManaged = this.processLauncher.getProcess(pid);
        return {
          pid,
          exitCode: updatedManaged?.exitCode,
          reason: "graceful",
          success: true,
        };
      }

      this.securityManager.auditOperation(
        "process_terminate",
        managed.command,
        pid,
        `error: ${error}`
      );

      throw new ProcessError(
        `Failed to terminate process: ${error}`,
        "TERMINATION_FAILED"
      );
    }
  }

  /**
   * Terminate a process forcefully (SIGKILL)
   * @param pid Process ID
   * @returns Termination result
   */
  async terminateForcefully(pid: number): Promise<TerminationResult> {
    // Validate that we can terminate this process
    this.securityManager.validateSignalTarget(pid);

    // Check if process exists
    const managed = this.processLauncher.getProcess(pid);
    if (!managed) {
      throw new ProcessError("Process not found", "PROCESS_NOT_FOUND");
    }

    // If already stopped, return immediately
    if (managed.state !== "running") {
      return {
        pid,
        exitCode: managed.exitCode,
        reason: "forced",
        success: true,
      };
    }

    try {
      // Send SIGKILL signal
      process.kill(pid, "SIGKILL");

      // Wait a bit for the process to be killed
      await this.waitForExit(pid, 1000);

      const updatedManaged = this.processLauncher.getProcess(pid);
      this.securityManager.auditOperation(
        "process_terminate",
        managed.command,
        pid,
        "forced_success"
      );

      return {
        pid,
        exitCode: updatedManaged?.exitCode,
        reason: "forced",
        success: true,
      };
    } catch (error) {
      // Process may have already exited
      if (
        error instanceof Error &&
        (error.message.includes("ESRCH") || error.message.includes("no such"))
      ) {
        const updatedManaged = this.processLauncher.getProcess(pid);
        return {
          pid,
          exitCode: updatedManaged?.exitCode,
          reason: "forced",
          success: true,
        };
      }

      this.securityManager.auditOperation(
        "process_terminate",
        managed.command,
        pid,
        `error: ${error}`
      );

      throw new ProcessError(
        `Failed to terminate process: ${error}`,
        "TERMINATION_FAILED"
      );
    }
  }

  /**
   * Terminate a process group
   * @param pids Array of process IDs
   * @param force Whether to use forced termination (default: false)
   * @param timeout Timeout for graceful termination (default: 5000ms)
   * @returns Array of termination results
   */
  async terminateGroup(
    pids: number[],
    force: boolean = false,
    timeout: number = 5000
  ): Promise<TerminationResult[]> {
    const results: TerminationResult[] = [];

    // Terminate all processes in parallel
    const terminationPromises = pids.map((pid) => {
      if (force) {
        return this.terminateForcefully(pid).catch((error) => ({
          pid,
          exitCode: undefined,
          reason: "forced" as const,
          success: false,
        }));
      } else {
        return this.terminateGracefully(pid, timeout).catch((error) => ({
          pid,
          exitCode: undefined,
          reason: "graceful" as const,
          success: false,
        }));
      }
    });

    const terminationResults = await Promise.all(terminationPromises);
    results.push(...terminationResults);

    return results;
  }

  /**
   * Terminate a process group by group ID
   * @param groupId Group ID
   * @param force Whether to use forced termination (default: false)
   * @param timeout Timeout for graceful termination (default: 5000ms)
   * @returns Array of termination results
   * @throws Error if process manager not available or group not found
   */
  async terminateGroupById(
    groupId: string,
    force: boolean = false,
    timeout: number = 5000
  ): Promise<TerminationResult[]> {
    if (!this.processManager) {
      throw new ProcessError(
        "Process manager not available",
        "PROCESS_MANAGER_NOT_AVAILABLE"
      );
    }

    const group = this.processManager.getGroup(groupId);
    if (!group) {
      throw new ProcessError(
        `Process group not found: ${groupId}`,
        "GROUP_NOT_FOUND"
      );
    }

    // Terminate all processes in the group
    return this.terminateGroup(group.processes, force, timeout);
  }

  /**
   * Wait for a process to exit
   * @param pid Process ID
   * @param timeout Timeout in milliseconds
   * @returns True if process exited within timeout, false otherwise
   */
  private async waitForExit(pid: number, timeout: number): Promise<boolean> {
    const startTime = Date.now();

    return new Promise<boolean>((resolve) => {
      const checkInterval = setInterval(() => {
        try {
          // Check if process still exists (signal 0 doesn't actually send a signal)
          process.kill(pid, 0);

          // Process still exists, check timeout
          if (Date.now() - startTime >= timeout) {
            clearInterval(checkInterval);
            resolve(false); // Timeout
          }
        } catch (error) {
          // Process no longer exists (ESRCH error)
          clearInterval(checkInterval);
          resolve(true); // Exited successfully
        }
      }, 100); // Check every 100ms
    });
  }
}
