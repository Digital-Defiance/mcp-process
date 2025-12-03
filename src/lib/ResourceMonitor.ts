/**
 * ResourceMonitor - Monitors process resource usage and enforces limits
 *
 * Responsibilities:
 * - Monitor CPU and memory usage using pidusage
 * - Monitor I/O statistics
 * - Track historical data
 * - Enforce resource limits
 * - Terminate processes exceeding limits
 */

import pidusage from "pidusage";
import * as os from "os";
import { ProcessStats, ResourceLimits, ProcessError } from "../types";
import { IResourceMonitor } from "../interfaces";
import { ErrorHandler } from "./ErrorHandler";

export class ResourceMonitor implements IResourceMonitor {
  private monitors: Map<number, NodeJS.Timeout> = new Map();
  private history: Map<number, ProcessStats[]> = new Map();
  private limits: Map<number, ResourceLimits> = new Map();
  private readonly SAMPLE_INTERVAL_MS = 1000; // 1 second
  private readonly MAX_HISTORY_SAMPLES = 100;

  /**
   * Start monitoring a process
   * @param pid Process ID
   * @param limits Resource limits to enforce
   */
  startMonitoring(pid: number, limits: ResourceLimits): void {
    // Stop existing monitoring if any
    this.stopMonitoring(pid);

    // Store limits
    this.limits.set(pid, limits);

    // Initialize history
    this.history.set(pid, []);

    // Start monitoring interval
    const interval = setInterval(async () => {
      try {
        await this.sampleAndEnforce(pid);
      } catch (error) {
        // Process may have exited or become unavailable
        this.stopMonitoring(pid);
      }
    }, this.SAMPLE_INTERVAL_MS);

    this.monitors.set(pid, interval);
  }

  /**
   * Stop monitoring a process
   * @param pid Process ID
   */
  stopMonitoring(pid: number): void {
    const interval = this.monitors.get(pid);
    if (interval) {
      clearInterval(interval);
      this.monitors.delete(pid);
    }
    // Keep history and limits for retrieval
  }

  /**
   * Get current statistics for a process
   * @param pid Process ID
   * @returns Current process statistics
   */
  async getStats(pid: number): Promise<ProcessStats> {
    try {
      const stats = await pidusage(pid);

      const processStats: ProcessStats = {
        cpuPercent: stats.cpu,
        memoryMB: stats.memory / 1024 / 1024,
        threadCount: stats.ctime !== undefined ? 1 : 1, // pidusage doesn't provide thread count directly
        ioRead: 0, // pidusage doesn't provide I/O stats on all platforms
        ioWrite: 0,
        uptime: stats.elapsed / 1000,
      };

      return processStats;
    } catch (error) {
      throw new ProcessError(
        `Failed to get stats for process ${pid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "STATS_FAILED"
      );
    }
  }

  /**
   * Get historical statistics for a process
   * @param pid Process ID
   * @returns Array of historical statistics
   */
  getHistory(pid: number): ProcessStats[] {
    return this.history.get(pid) || [];
  }

  /**
   * Get system-wide statistics
   * @returns System statistics
   */
  getSystemStats(): {
    totalCpuPercent: number;
    totalMemoryMB: number;
    freeMemoryMB: number;
    processCount: number;
  } {
    const totalMemory = os.totalmem() / 1024 / 1024;
    const freeMemory = os.freemem() / 1024 / 1024;
    const usedMemory = totalMemory - freeMemory;

    // Get CPU usage (average across all cores)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach((cpu) => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuPercent = 100 - (100 * totalIdle) / totalTick;

    return {
      totalCpuPercent: cpuPercent,
      totalMemoryMB: usedMemory,
      freeMemoryMB: freeMemory,
      processCount: this.monitors.size,
    };
  }

  /**
   * Sample process statistics and enforce limits
   * @param pid Process ID
   */
  private async sampleAndEnforce(pid: number): Promise<void> {
    const stats = await this.getStats(pid);
    const limits = this.limits.get(pid);

    // Store in history
    const hist = this.history.get(pid) || [];
    hist.push(stats);
    if (hist.length > this.MAX_HISTORY_SAMPLES) {
      hist.shift(); // Remove oldest sample
    }
    this.history.set(pid, hist);

    // Enforce limits if configured
    if (limits) {
      this.enforceLimits(pid, stats, limits);
    }
  }

  /**
   * Enforce resource limits for a process
   * @param pid Process ID
   * @param stats Current statistics
   * @param limits Resource limits
   */
  private enforceLimits(
    pid: number,
    stats: ProcessStats,
    limits: ResourceLimits
  ): void {
    // Check CPU limit
    if (
      limits.maxCpuPercent !== undefined &&
      stats.cpuPercent > limits.maxCpuPercent
    ) {
      this.stopMonitoring(pid);
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        // Process may have already exited - log but don't fail
        console.error(
          `[ResourceMonitor] Failed to terminate process ${pid} for CPU limit:`,
          error
        );
      }

      // Use ErrorHandler to format the error
      const errorResponse = ErrorHandler.handleResourceLimitError(
        "CPU",
        stats.cpuPercent,
        limits.maxCpuPercent,
        pid
      );
      throw new ProcessError(errorResponse.message, errorResponse.code);
    }

    // Check memory limit
    if (
      limits.maxMemoryMB !== undefined &&
      stats.memoryMB > limits.maxMemoryMB
    ) {
      this.stopMonitoring(pid);
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        // Process may have already exited - log but don't fail
        console.error(
          `[ResourceMonitor] Failed to terminate process ${pid} for memory limit:`,
          error
        );
      }

      // Use ErrorHandler to format the error
      const errorResponse = ErrorHandler.handleResourceLimitError(
        "Memory",
        stats.memoryMB,
        limits.maxMemoryMB,
        pid
      );
      throw new ProcessError(errorResponse.message, errorResponse.code);
    }

    // Check CPU time limit
    if (limits.maxCpuTime !== undefined && stats.uptime > limits.maxCpuTime) {
      this.stopMonitoring(pid);
      try {
        process.kill(pid, "SIGTERM");
      } catch (error) {
        // Process may have already exited - log but don't fail
        console.error(
          `[ResourceMonitor] Failed to terminate process ${pid} for CPU time limit:`,
          error
        );
      }

      // Use ErrorHandler to format the error
      const errorResponse = ErrorHandler.handleResourceLimitError(
        "CPU time",
        stats.uptime,
        limits.maxCpuTime,
        pid
      );
      throw new ProcessError(errorResponse.message, errorResponse.code);
    }
  }
}
