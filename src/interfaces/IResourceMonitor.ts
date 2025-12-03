/**
 * Interface for resource monitoring functionality
 */

import { ProcessStats, ResourceLimits } from "../types";

export interface IResourceMonitor {
  /**
   * Start monitoring a process
   * @param pid Process ID
   * @param limits Resource limits to enforce
   */
  startMonitoring(pid: number, limits: ResourceLimits): void;

  /**
   * Stop monitoring a process
   * @param pid Process ID
   */
  stopMonitoring(pid: number): void;

  /**
   * Get current statistics for a process
   * @param pid Process ID
   * @returns Current process statistics
   */
  getStats(pid: number): Promise<ProcessStats>;

  /**
   * Get historical statistics for a process
   * @param pid Process ID
   * @returns Array of historical statistics
   */
  getHistory(pid: number): ProcessStats[];
}
