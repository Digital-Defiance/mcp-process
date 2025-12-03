/**
 * ProcessManager - Manages all process lifecycle and tracking
 *
 * Responsibilities:
 * - Track all managed processes
 * - Provide process lookup
 * - Enforce concurrent process limits
 * - Clean up terminated processes
 * - Manage process groups
 */

import {
  ManagedProcess,
  ProcessGroup as ProcessGroupType,
  ProcessStats,
} from "../types";
import { IProcessManager } from "../interfaces";
import { ProcessGroupManager, GroupStatus } from "./ProcessGroup";
import { ChildProcess } from "child_process";
import { ZombieReaper } from "./ZombieReaper";
import { ErrorHandler } from "./ErrorHandler";

/**
 * ProcessManager implementation
 * Tracks all managed processes and provides lookup/management capabilities
 */
export class ProcessManager implements IProcessManager {
  private processes: Map<number, ManagedProcess> = new Map();
  private processGroupManager: ProcessGroupManager = new ProcessGroupManager();
  private childProcesses: Map<number, ChildProcess> = new Map();
  private zombieReaper: ZombieReaper;

  constructor() {
    // Initialize zombie reaper with 5-second interval
    this.zombieReaper = new ZombieReaper(5000);
    this.zombieReaper.start();
  }

  /**
   * Register a managed process
   * @param process Managed process information
   * @param childProcess Optional child process instance for pipeline support
   */
  register(process: ManagedProcess, childProcess?: ChildProcess): void {
    this.processes.set(process.pid, process);
    if (childProcess) {
      this.childProcesses.set(process.pid, childProcess);
    }
  }

  /**
   * Unregister a managed process
   * @param pid Process ID
   */
  unregister(pid: number): void {
    // Attempt to reap the process if it's a zombie
    try {
      this.zombieReaper.reapProcess(pid);
    } catch (error) {
      // Log but don't fail - the process may have already been reaped
      console.error(`[ProcessManager] Error reaping process ${pid}:`, error);
    }

    this.processes.delete(pid);
    this.childProcesses.delete(pid);

    // Remove from any groups
    const allGroups = this.processGroupManager.getAllGroups();
    for (const group of allGroups) {
      if (group.processes.includes(pid)) {
        this.processGroupManager.removeFromGroup(group.id, pid);
      }
    }
  }

  /**
   * Get a managed process by PID
   * @param pid Process ID
   * @returns Managed process or undefined
   */
  get(pid: number): ManagedProcess | undefined {
    return this.processes.get(pid);
  }

  /**
   * Get all managed processes
   * @returns Array of managed processes
   */
  getAll(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Get process status information
   * @param pid Process ID
   * @returns Status information including state, uptime, and resource usage
   */
  getStatus(pid: number):
    | {
        state: string;
        uptime: number;
        stats: ProcessStats;
        exitCode?: number;
      }
    | undefined {
    const process = this.processes.get(pid);
    if (!process) {
      return undefined;
    }

    const uptime = (Date.now() - process.startTime.getTime()) / 1000;

    return {
      state: process.state,
      uptime,
      stats: process.stats,
      exitCode: process.exitCode,
    };
  }

  /**
   * Create a process group
   * @param name Group name
   * @param pipeline Whether this is a pipeline group
   * @returns Group ID
   */
  createGroup(name: string, pipeline: boolean): string {
    return this.processGroupManager.createGroup(name, pipeline);
  }

  /**
   * Add a process to a group
   * @param groupId Group ID
   * @param pid Process ID
   * @throws Error if group doesn't exist or process doesn't exist
   */
  addToGroup(groupId: string, pid: number): void {
    const process = this.processes.get(pid);
    if (!process) {
      throw new Error(`Process not found: ${pid}`);
    }

    this.processGroupManager.addToGroup(groupId, pid);
  }

  /**
   * Get a process group
   * @param groupId Group ID
   * @returns Process group or undefined
   */
  getGroup(groupId: string): ProcessGroupType | undefined {
    return this.processGroupManager.getGroup(groupId);
  }

  /**
   * Get all process groups
   * @returns Array of process groups
   */
  getAllGroups(): ProcessGroupType[] {
    return this.processGroupManager.getAllGroups();
  }

  /**
   * Remove a process from a group
   * @param groupId Group ID
   * @param pid Process ID
   * @throws Error if group doesn't exist
   */
  removeFromGroup(groupId: string, pid: number): void {
    this.processGroupManager.removeFromGroup(groupId, pid);
  }

  /**
   * Delete a process group
   * @param groupId Group ID
   * @returns True if group was deleted, false if not found
   */
  deleteGroup(groupId: string): boolean {
    return this.processGroupManager.deleteGroup(groupId);
  }

  /**
   * Get group status including pipeline health
   * @param groupId Group ID
   * @returns Group status information
   */
  getGroupStatus(groupId: string): GroupStatus | undefined {
    return this.processGroupManager.getGroupStatus(groupId);
  }

  /**
   * Connect two processes in a pipeline
   * @param groupId Group ID
   * @param sourcePid Source process ID
   * @param targetPid Target process ID
   * @throws Error if processes or group not found, or not a pipeline group
   */
  connectPipeline(groupId: string, sourcePid: number, targetPid: number): void {
    const sourceChild = this.childProcesses.get(sourcePid);
    const targetChild = this.childProcesses.get(targetPid);

    if (!sourceChild) {
      throw new Error(`Source process ${sourcePid} not found or not tracked`);
    }

    if (!targetChild) {
      throw new Error(`Target process ${targetPid} not found or not tracked`);
    }

    this.processGroupManager.connectPipeline(
      groupId,
      sourcePid,
      targetPid,
      sourceChild,
      targetChild
    );
  }

  /**
   * Get child process instance
   * @param pid Process ID
   * @returns Child process or undefined
   */
  getChildProcess(pid: number): ChildProcess | undefined {
    return this.childProcesses.get(pid);
  }

  /**
   * Clean up terminated processes
   * Removes processes that are no longer running from tracking
   * Also handles zombie process reaping
   */
  cleanupTerminated(): void {
    const terminated: number[] = [];

    for (const [pid, process] of this.processes.entries()) {
      if (process.state === "stopped" || process.state === "crashed") {
        terminated.push(pid);

        // Check if it's a zombie and log
        if (this.zombieReaper.isZombie(pid)) {
          const errorResponse = ErrorHandler.handleZombieProcess(pid);
          console.error(
            `[ProcessManager] ${errorResponse.message}`,
            errorResponse.details
          );
        }
      }
    }

    for (const pid of terminated) {
      this.unregister(pid);
    }

    console.error(
      `[ProcessManager] Cleaned up ${terminated.length} terminated processes`
    );
  }

  /**
   * Stop the zombie reaper
   * Should be called during shutdown
   */
  stopZombieReaper(): void {
    this.zombieReaper.stop();
  }

  /**
   * Get count of running processes
   * @returns Number of running processes
   */
  getRunningCount(): number {
    return Array.from(this.processes.values()).filter(
      (p) => p.state === "running"
    ).length;
  }

  /**
   * Create a pipeline from a list of processes
   * Creates a group and connects processes in sequence
   * @param name Pipeline name
   * @param pids Array of process IDs in pipeline order
   * @returns Group ID
   * @throws Error if any process not found or connection fails
   */
  createPipeline(name: string, pids: number[]): string {
    if (pids.length < 2) {
      throw new Error("Pipeline requires at least 2 processes");
    }

    // Create pipeline group
    const groupId = this.createGroup(name, true);

    // Add all processes to the group
    for (const pid of pids) {
      this.addToGroup(groupId, pid);
    }

    // Connect processes in sequence
    for (let i = 0; i < pids.length - 1; i++) {
      const sourcePid = pids[i];
      const targetPid = pids[i + 1];
      this.connectPipeline(groupId, sourcePid, targetPid);
    }

    return groupId;
  }

  /**
   * Get the processes map (for IOManager)
   * @returns Map of PIDs to managed processes
   */
  getProcesses(): Map<number, ManagedProcess> {
    return this.processes;
  }

  /**
   * Get the child processes map (for IOManager)
   * @returns Map of PIDs to child processes
   */
  getChildProcesses(): Map<number, ChildProcess> {
    return this.childProcesses;
  }
}
