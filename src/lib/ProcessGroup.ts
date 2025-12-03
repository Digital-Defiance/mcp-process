/**
 * ProcessGroup - Manages process groups and pipelines
 *
 * Responsibilities:
 * - Track group members
 * - Assign group identifiers
 * - Support pipeline connections
 * - Manage pipeline data flow
 */

import { ChildProcess } from "child_process";
import { ProcessGroup as ProcessGroupType } from "../types";
import { v4 as uuidv4 } from "uuid";

/**
 * ProcessGroupManager class for managing groups of related processes
 */
export class ProcessGroupManager {
  private groups: Map<string, ProcessGroupType> = new Map();
  private pipelineConnections: Map<string, PipelineConnection[]> = new Map();

  /**
   * Create a new process group
   * @param name Group name
   * @param pipeline Whether this is a pipeline group
   * @returns Group ID
   */
  createGroup(name: string, pipeline: boolean = false): string {
    const groupId = uuidv4();

    const group: ProcessGroupType = {
      id: groupId,
      name,
      processes: [],
      pipeline,
    };

    this.groups.set(groupId, group);

    if (pipeline) {
      this.pipelineConnections.set(groupId, []);
    }

    return groupId;
  }

  /**
   * Add a process to a group
   * @param groupId Group ID
   * @param pid Process ID
   * @throws Error if group doesn't exist
   */
  addToGroup(groupId: string, pid: number): void {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Process group not found: ${groupId}`);
    }

    if (!group.processes.includes(pid)) {
      group.processes.push(pid);
    }
  }

  /**
   * Remove a process from a group
   * @param groupId Group ID
   * @param pid Process ID
   * @throws Error if group doesn't exist
   */
  removeFromGroup(groupId: string, pid: number): void {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Process group not found: ${groupId}`);
    }

    const index = group.processes.indexOf(pid);
    if (index !== -1) {
      group.processes.splice(index, 1);
    }

    // Clean up pipeline connections involving this process
    if (group.pipeline) {
      const connections = this.pipelineConnections.get(groupId);
      if (connections) {
        const filtered = connections.filter(
          (conn) => conn.sourcePid !== pid && conn.targetPid !== pid
        );
        this.pipelineConnections.set(groupId, filtered);
      }
    }
  }

  /**
   * Get a process group
   * @param groupId Group ID
   * @returns Process group or undefined
   */
  getGroup(groupId: string): ProcessGroupType | undefined {
    return this.groups.get(groupId);
  }

  /**
   * Get all process groups
   * @returns Array of process groups
   */
  getAllGroups(): ProcessGroupType[] {
    return Array.from(this.groups.values());
  }

  /**
   * Delete a process group
   * @param groupId Group ID
   * @returns True if group was deleted, false if not found
   */
  deleteGroup(groupId: string): boolean {
    const deleted = this.groups.delete(groupId);
    if (deleted) {
      this.pipelineConnections.delete(groupId);
    }
    return deleted;
  }

  /**
   * Get all processes in a group
   * @param groupId Group ID
   * @returns Array of process IDs
   */
  getGroupProcesses(groupId: string): number[] {
    const group = this.groups.get(groupId);
    return group ? [...group.processes] : [];
  }

  /**
   * Check if a group is a pipeline
   * @param groupId Group ID
   * @returns True if group is a pipeline
   */
  isPipeline(groupId: string): boolean {
    const group = this.groups.get(groupId);
    return group?.pipeline ?? false;
  }

  /**
   * Connect two processes in a pipeline
   * @param groupId Group ID
   * @param sourcePid Source process ID (stdout)
   * @param targetPid Target process ID (stdin)
   * @param sourceProcess Source child process
   * @param targetProcess Target child process
   * @throws Error if group is not a pipeline or processes not in group
   */
  connectPipeline(
    groupId: string,
    sourcePid: number,
    targetPid: number,
    sourceProcess: ChildProcess,
    targetProcess: ChildProcess
  ): void {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Process group not found: ${groupId}`);
    }

    if (!group.pipeline) {
      throw new Error(`Group ${groupId} is not a pipeline group`);
    }

    if (!group.processes.includes(sourcePid)) {
      throw new Error(`Source process ${sourcePid} not in group ${groupId}`);
    }

    if (!group.processes.includes(targetPid)) {
      throw new Error(`Target process ${targetPid} not in group ${groupId}`);
    }

    // Connect stdout of source to stdin of target
    if (!sourceProcess.stdout) {
      throw new Error(`Source process ${sourcePid} has no stdout`);
    }

    if (!targetProcess.stdin) {
      throw new Error(`Target process ${targetPid} has no stdin`);
    }

    // Pipe the streams
    sourceProcess.stdout.pipe(targetProcess.stdin);

    // Track the connection
    const connections = this.pipelineConnections.get(groupId) || [];
    connections.push({
      sourcePid,
      targetPid,
      connected: true,
    });
    this.pipelineConnections.set(groupId, connections);

    // Handle pipeline failures
    sourceProcess.stdout.on("error", (error) => {
      console.error(
        `Pipeline error: stdout of ${sourcePid} failed:`,
        error.message
      );
      this.markConnectionFailed(groupId, sourcePid, targetPid);
    });

    targetProcess.stdin.on("error", (error) => {
      console.error(
        `Pipeline error: stdin of ${targetPid} failed:`,
        error.message
      );
      this.markConnectionFailed(groupId, sourcePid, targetPid);
    });

    // Handle source process exit
    sourceProcess.on("exit", () => {
      // Close target stdin when source exits
      if (targetProcess.stdin && !targetProcess.stdin.destroyed) {
        targetProcess.stdin.end();
      }
    });
  }

  /**
   * Get pipeline connections for a group
   * @param groupId Group ID
   * @returns Array of pipeline connections
   */
  getPipelineConnections(groupId: string): PipelineConnection[] {
    return this.pipelineConnections.get(groupId) || [];
  }

  /**
   * Mark a pipeline connection as failed
   * @param groupId Group ID
   * @param sourcePid Source process ID
   * @param targetPid Target process ID
   */
  private markConnectionFailed(
    groupId: string,
    sourcePid: number,
    targetPid: number
  ): void {
    const connections = this.pipelineConnections.get(groupId);
    if (connections) {
      const connection = connections.find(
        (conn) => conn.sourcePid === sourcePid && conn.targetPid === targetPid
      );
      if (connection) {
        connection.connected = false;
      }
    }
  }

  /**
   * Get group status including pipeline health
   * @param groupId Group ID
   * @returns Group status information
   */
  getGroupStatus(groupId: string): GroupStatus | undefined {
    const group = this.groups.get(groupId);
    if (!group) {
      return undefined;
    }

    const status: GroupStatus = {
      id: group.id,
      name: group.name,
      processCount: group.processes.length,
      processes: [...group.processes],
      isPipeline: group.pipeline ?? false,
    };

    if (group.pipeline) {
      const connections = this.pipelineConnections.get(groupId) || [];
      status.pipelineConnections = connections.length;
      status.pipelineHealthy = connections.every((conn) => conn.connected);
    }

    return status;
  }
}

/**
 * Pipeline connection information
 */
export interface PipelineConnection {
  sourcePid: number;
  targetPid: number;
  connected: boolean;
}

/**
 * Group status information
 */
export interface GroupStatus {
  id: string;
  name: string;
  processCount: number;
  processes: number[];
  isPipeline: boolean;
  pipelineConnections?: number;
  pipelineHealthy?: boolean;
}
