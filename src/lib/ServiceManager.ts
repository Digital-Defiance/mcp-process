/**
 * ServiceManager - Manages long-running services with auto-restart and health checks
 *
 * Responsibilities:
 * - Launch services in detached mode
 * - Implement auto-restart on crash
 * - Perform health checks
 * - Track service state
 * - Apply backoff strategy for restarts
 */

import { spawn, ChildProcess } from "child_process";
import {
  ServiceConfig,
  ManagedProcess,
  ProcessError,
  HealthCheckConfig,
  RestartPolicy,
} from "../types";
import { IProcessLauncher, ISecurityManager } from "../interfaces";

/**
 * Service state enumeration
 */
export type ServiceState =
  | "running"
  | "stopped"
  | "crashed"
  | "restarting"
  | "unhealthy";

/**
 * Managed service information
 */
export interface ManagedService {
  /** Service name */
  name: string;
  /** Current process ID (if running) */
  pid?: number;
  /** Service configuration */
  config: ServiceConfig;
  /** Current service state */
  state: ServiceState;
  /** Service start time */
  startTime: Date;
  /** Number of restart attempts */
  restartCount: number;
  /** Last health check result */
  lastHealthCheck?: {
    success: boolean;
    timestamp: Date;
    message?: string;
  };
  /** Health check interval timer */
  healthCheckTimer?: NodeJS.Timeout;
}

/**
 * ServiceManager implementation
 * Manages long-running services with auto-restart and health monitoring
 */
export class ServiceManager {
  private services: Map<string, ManagedService> = new Map();
  private processLauncher: IProcessLauncher;
  private securityManager: ISecurityManager;

  constructor(
    processLauncher: IProcessLauncher,
    securityManager: ISecurityManager
  ) {
    this.processLauncher = processLauncher;
    this.securityManager = securityManager;
  }

  /**
   * Start a service with auto-restart and health monitoring
   * @param config Service configuration
   * @returns Service name
   */
  async startService(config: ServiceConfig): Promise<string> {
    // Check if service already exists
    if (this.services.has(config.name)) {
      throw new ProcessError(
        `Service ${config.name} already exists`,
        "SERVICE_EXISTS"
      );
    }

    // Launch the process
    const pid = await this.processLauncher.launch(config);

    // Create managed service entry
    const service: ManagedService = {
      name: config.name,
      pid,
      config,
      state: "running",
      startTime: new Date(),
      restartCount: 0,
    };

    this.services.set(config.name, service);

    // Set up health check if configured
    if (config.healthCheck) {
      this.startHealthCheck(service);
    }

    // Set up auto-restart monitoring
    if (config.restartPolicy.enabled) {
      this.setupAutoRestart(service);
    }

    // Audit the operation
    this.securityManager.auditOperation(
      "service_start",
      config.executable,
      pid,
      "success"
    );

    return config.name;
  }

  /**
   * Stop a service and disable auto-restart
   * @param name Service name
   * @throws Error if service not found
   */
  async stopService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new ProcessError(`Service ${name} not found`, "SERVICE_NOT_FOUND");
    }

    // Stop health check
    if (service.healthCheckTimer) {
      clearInterval(service.healthCheckTimer);
      service.healthCheckTimer = undefined;
    }

    // Terminate the process if running
    if (service.pid) {
      const childProcess = this.processLauncher.getChildProcess(service.pid);
      if (childProcess) {
        childProcess.kill("SIGTERM");
      }

      // Audit the operation
      this.securityManager.auditOperation(
        "service_stop",
        service.config.executable,
        service.pid,
        "success"
      );
    }

    // Update service state
    service.state = "stopped";
    service.pid = undefined;

    // Remove from tracking
    this.services.delete(name);
  }

  /**
   * Get service status
   * @param name Service name
   * @returns Service information or undefined
   */
  getService(name: string): ManagedService | undefined {
    return this.services.get(name);
  }

  /**
   * Get all managed services
   * @returns Array of managed services
   */
  getAllServices(): ManagedService[] {
    return Array.from(this.services.values());
  }

  /**
   * Restart a service
   * @param name Service name
   * @throws Error if service not found
   */
  async restartService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new ProcessError(`Service ${name} not found`, "SERVICE_NOT_FOUND");
    }

    // Stop the current process
    if (service.pid) {
      const childProcess = this.processLauncher.getChildProcess(service.pid);
      if (childProcess) {
        childProcess.kill("SIGTERM");
      }
    }

    // Update state
    service.state = "restarting";

    // Apply backoff delay
    const backoffMs = this.calculateBackoff(
      service.restartCount,
      service.config.restartPolicy.backoffMs
    );

    await this.sleep(backoffMs);

    // Launch new process
    try {
      const pid = await this.processLauncher.launch(service.config);
      service.pid = pid;
      service.state = "running";
      service.startTime = new Date();
      service.restartCount++;

      // Audit the restart
      this.securityManager.auditOperation(
        "service_restart",
        service.config.executable,
        pid,
        `restart_count_${service.restartCount}`
      );
    } catch (error) {
      service.state = "crashed";
      service.pid = undefined;
      throw error;
    }
  }

  /**
   * Setup auto-restart monitoring for a service
   * @param service Managed service
   */
  private setupAutoRestart(service: ManagedService): void {
    // Monitor process exit
    const checkInterval = setInterval(() => {
      if (!service.pid) {
        return;
      }

      const process = this.processLauncher.getProcess(service.pid);
      if (!process) {
        return;
      }

      // Check if process has crashed
      if (process.state === "crashed" || process.state === "stopped") {
        // Check if we've exceeded max retries
        if (
          service.restartCount >= service.config.restartPolicy.maxRetries &&
          service.config.restartPolicy.maxRetries > 0
        ) {
          service.state = "crashed";
          clearInterval(checkInterval);

          // Audit max retries exceeded
          this.securityManager.auditOperation(
            "service_max_retries",
            service.config.executable,
            service.pid,
            `max_retries_${service.config.restartPolicy.maxRetries}`
          );

          return;
        }

        // Restart the service
        this.restartService(service.name).catch((error) => {
          console.error(`Failed to restart service ${service.name}:`, error);
          service.state = "crashed";
          clearInterval(checkInterval);
        });
      }
    }, 1000); // Check every second

    // Store the interval so we can clear it when service is stopped
    // Note: We're using a simple approach here. In production, you'd want
    // to track these intervals more carefully
  }

  /**
   * Start health check monitoring for a service
   * @param service Managed service
   */
  private startHealthCheck(service: ManagedService): void {
    if (!service.config.healthCheck) {
      return;
    }

    const healthCheck = service.config.healthCheck;

    // Perform health check periodically
    service.healthCheckTimer = setInterval(async () => {
      try {
        const result = await this.executeHealthCheck(healthCheck);

        service.lastHealthCheck = {
          success: result.success,
          timestamp: new Date(),
          message: result.message,
        };

        // If health check fails, mark service as unhealthy and restart
        if (!result.success) {
          service.state = "unhealthy";

          // Audit unhealthy state
          if (service.pid) {
            this.securityManager.auditOperation(
              "service_unhealthy",
              service.config.executable,
              service.pid,
              result.message || "health_check_failed"
            );
          }

          // Restart if auto-restart is enabled
          if (service.config.restartPolicy.enabled) {
            await this.restartService(service.name);
          }
        } else if (service.state === "unhealthy") {
          // Service recovered
          service.state = "running";
        }
      } catch (error) {
        console.error(`Health check error for service ${service.name}:`, error);
        service.lastHealthCheck = {
          success: false,
          timestamp: new Date(),
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }, healthCheck.interval);
  }

  /**
   * Execute a health check command
   * @param healthCheck Health check configuration
   * @returns Health check result
   */
  private async executeHealthCheck(
    healthCheck: HealthCheckConfig
  ): Promise<{ success: boolean; message?: string }> {
    return new Promise((resolve) => {
      // Parse command and arguments
      const parts = healthCheck.command.split(" ");
      const command = parts[0];
      const args = parts.slice(1);

      // Spawn health check process
      const child = spawn(command, args, {
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";

      if (child.stdout) {
        child.stdout.on("data", (data) => {
          stdout += data.toString();
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          stderr += data.toString();
        });
      }

      // Set timeout
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve({
          success: false,
          message: "Health check timeout",
        });
      }, healthCheck.timeout);

      child.on("exit", (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve({
            success: true,
            message: stdout.trim(),
          });
        } else {
          resolve({
            success: false,
            message: stderr.trim() || `Exit code: ${code}`,
          });
        }
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          message: error.message,
        });
      });
    });
  }

  /**
   * Calculate backoff delay with exponential backoff
   * @param restartCount Number of restarts
   * @param baseBackoffMs Base backoff in milliseconds
   * @returns Backoff delay in milliseconds
   */
  private calculateBackoff(
    restartCount: number,
    baseBackoffMs: number
  ): number {
    // Exponential backoff: baseBackoff * 2^restartCount
    // Cap at 60 seconds
    const backoff = Math.min(baseBackoffMs * Math.pow(2, restartCount), 60000);
    return backoff;
  }

  /**
   * Sleep for a specified duration
   * @param ms Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup all services
   * Stops all services and clears timers
   */
  async cleanup(): Promise<void> {
    const serviceNames = Array.from(this.services.keys());

    for (const name of serviceNames) {
      try {
        await this.stopService(name);
      } catch (error) {
        console.error(`Error stopping service ${name}:`, error);
      }
    }
  }
}
