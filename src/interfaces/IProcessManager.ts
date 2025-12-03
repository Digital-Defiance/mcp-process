/**
 * Interface for process management functionality
 */

import { ManagedProcess, ProcessGroup } from "../types";
import { ChildProcess } from "child_process";

export interface IProcessManager {
  /**
   * Register a managed process
   * @param process Managed process information
   * @param childProcess Optional child process instance for pipeline support
   */
  register(process: ManagedProcess, childProcess?: ChildProcess): void;

  /**
   * Unregister a managed process
   * @param pid Process ID
   */
  unregister(pid: number): void;

  /**
   * Get a managed process by PID
   * @param pid Process ID
   * @returns Managed process or undefined
   */
  get(pid: number): ManagedProcess | undefined;

  /**
   * Get all managed processes
   * @returns Array of managed processes
   */
  getAll(): ManagedProcess[];

  /**
   * Create a process group
   * @param name Group name
   * @param pipeline Whether this is a pipeline group
   * @returns Group ID
   */
  createGroup(name: string, pipeline: boolean): string;

  /**
   * Add a process to a group
   * @param groupId Group ID
   * @param pid Process ID
   */
  addToGroup(groupId: string, pid: number): void;

  /**
   * Remove a process from a group
   * @param groupId Group ID
   * @param pid Process ID
   */
  removeFromGroup(groupId: string, pid: number): void;

  /**
   * Get a process group
   * @param groupId Group ID
   * @returns Process group or undefined
   */
  getGroup(groupId: string): ProcessGroup | undefined;

  /**
   * Get all process groups
   * @returns Array of process groups
   */
  getAllGroups(): ProcessGroup[];

  /**
   * Delete a process group
   * @param groupId Group ID
   * @returns True if group was deleted, false if not found
   */
  deleteGroup(groupId: string): boolean;

  /**
   * Connect two processes in a pipeline
   * @param groupId Group ID
   * @param sourcePid Source process ID
   * @param targetPid Target process ID
   */
  connectPipeline(groupId: string, sourcePid: number, targetPid: number): void;

  /**
   * Get child process instance
   * @param pid Process ID
   * @returns Child process or undefined
   */
  getChildProcess(pid: number): ChildProcess | undefined;
}
