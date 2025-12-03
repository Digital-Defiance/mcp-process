/**
 * Interface for process launching functionality
 */

import { ProcessConfig, ManagedProcess } from "../types";
import { ChildProcess } from "child_process";

export interface IProcessLauncher {
  /**
   * Launch a new process with the given configuration
   * @param config Process configuration
   * @returns Process ID of the launched process
   */
  launch(config: ProcessConfig): Promise<number>;

  /**
   * Check if a process is running
   * @param pid Process ID
   * @returns True if the process is running
   */
  isRunning(pid: number): boolean;

  /**
   * Get managed process information
   * @param pid Process ID
   * @returns Managed process or undefined
   */
  getProcess(pid: number): ManagedProcess | undefined;

  /**
   * Get child process instance
   * @param pid Process ID
   * @returns Child process or undefined
   */
  getChildProcess(pid: number): ChildProcess | undefined;
}
