/**
 * ProcessLauncher - Spawns and manages child processes
 *
 * Responsibilities:
 * - Spawn child processes with validated executables
 * - Set environment variables
 * - Configure working directory
 * - Capture stdout/stderr
 * - Track process PIDs
 */

import { spawn, ChildProcess } from "child_process";
import { ProcessConfig, ManagedProcess, ProcessError } from "../types";
import { IProcessLauncher } from "../interfaces";
import { ISecurityManager, ITimeoutManager } from "../interfaces";
import { ErrorHandler } from "./ErrorHandler";

export class ProcessLauncher implements IProcessLauncher {
  private processes: Map<number, ManagedProcess> = new Map();
  private childProcesses: Map<number, ChildProcess> = new Map();
  private securityManager: ISecurityManager;
  private timeoutManager?: ITimeoutManager;

  constructor(
    securityManager: ISecurityManager,
    timeoutManager?: ITimeoutManager
  ) {
    this.securityManager = securityManager;
    this.timeoutManager = timeoutManager;
  }

  /**
   * Launch a new process with the given configuration
   * @param config Process configuration
   * @returns Process ID of the launched process
   */
  async launch(config: ProcessConfig): Promise<number> {
    // Validate executable and arguments through security manager
    this.securityManager.validateExecutable(config.executable, config.args);

    // Validate working directory if specified
    if (config.cwd) {
      this.securityManager.validateWorkingDirectory(config.cwd);
    }

    // Sanitize environment variables
    const sanitizedEnv = config.env
      ? this.securityManager.sanitizeEnvironment(config.env)
      : {};

    // Check concurrent process limit
    this.securityManager.checkConcurrentLimit();

    // Check rate limit (using 'default' as agent ID for now)
    this.securityManager.checkLaunchRateLimit("default");

    // Spawn the process
    let child: ChildProcess;
    try {
      child = spawn(config.executable, config.args, {
        cwd: config.cwd || process.cwd(),
        env: { ...process.env, ...sanitizedEnv },
        stdio:
          config.captureOutput !== false ? ["pipe", "pipe", "pipe"] : "inherit",
      });
    } catch (error) {
      // Handle spawn errors with detailed error response
      const errorResponse = ErrorHandler.handleSpawnError(
        error as Error,
        config.executable
      );
      throw new ProcessError(errorResponse.message, errorResponse.code);
    }

    // Handle spawn errors
    if (!child.pid) {
      const errorResponse = ErrorHandler.handleSpawnError(
        new Error("Process spawned but no PID assigned"),
        config.executable
      );
      throw new ProcessError(errorResponse.message, errorResponse.code);
    }

    const pid = child.pid;

    // Register process with security manager
    this.securityManager.registerProcess(pid);

    // Create managed process entry
    const managed: ManagedProcess = {
      pid,
      command: config.executable,
      args: config.args,
      state: "running",
      startTime: new Date(),
      stats: {
        cpuPercent: 0,
        memoryMB: 0,
        threadCount: 1,
        ioRead: 0,
        ioWrite: 0,
        uptime: 0,
      },
      outputBuffer: [],
      errorBuffer: [],
    };

    this.processes.set(pid, managed);
    this.childProcesses.set(pid, child);

    // Capture output if enabled
    if (config.captureOutput !== false) {
      this.setupOutputCapture(child, managed);
    }

    // Handle process exit
    child.on("exit", (code, signal) => {
      managed.state = code === 0 ? "stopped" : "crashed";
      managed.exitCode = code ?? undefined;

      // Log crash information if process crashed
      if (managed.state === "crashed") {
        const errorResponse = ErrorHandler.handleProcessCrash(
          pid,
          code,
          signal
        );
        console.error(
          `[ProcessLauncher] ${errorResponse.message}`,
          errorResponse.details
        );

        // Audit the crash
        this.securityManager.auditOperation(
          "process_crash",
          managed.command,
          pid,
          `exit_code=${code ?? "null"}_signal=${signal ?? "null"}`
        );
      }

      // Flush output buffers on exit
      if (config.captureOutput !== false) {
        // Output is already captured in buffers, just ensure it's available
        console.error(
          `[ProcessLauncher] Process ${pid} exited, output flushed (${managed.outputBuffer.length} stdout chunks, ${managed.errorBuffer.length} stderr chunks)`
        );
      }

      this.securityManager.unregisterProcess(pid);
      this.childProcesses.delete(pid);

      // Clear timeout when process exits
      if (this.timeoutManager) {
        this.timeoutManager.clearTimeout(pid);
      }
    });

    // Handle spawn errors
    child.on("error", (error) => {
      managed.state = "crashed";

      // Format spawn error with detailed information
      const errorResponse = ErrorHandler.handleSpawnError(
        error,
        config.executable
      );
      console.error(
        `[ProcessLauncher] Process ${pid} error: ${errorResponse.message}`,
        errorResponse.details
      );

      // Audit the error
      this.securityManager.auditOperation(
        "process_error",
        managed.command,
        pid,
        errorResponse.code
      );

      this.securityManager.unregisterProcess(pid);
      this.childProcesses.delete(pid);

      // Clear timeout on error
      if (this.timeoutManager) {
        this.timeoutManager.clearTimeout(pid);
      }
    });

    // Set timeout if specified using TimeoutManager
    if (config.timeout && this.timeoutManager) {
      this.timeoutManager.registerTimeout(pid, config.timeout, (timeoutPid) => {
        const timeoutManaged = this.processes.get(timeoutPid);
        if (timeoutManaged && timeoutManaged.state === "running") {
          const timeoutChild = this.childProcesses.get(timeoutPid);
          if (timeoutChild) {
            // Terminate the process due to timeout
            timeoutChild.kill("SIGTERM");
            timeoutManaged.state = "crashed";
            timeoutManaged.exitCode = -1;

            // Audit timeout termination
            this.securityManager.auditOperation(
              "process_timeout",
              timeoutManaged.command,
              timeoutPid,
              "timeout_exceeded"
            );
          }
        }
      });
    }

    // Audit the operation
    this.securityManager.auditOperation(
      "process_launch",
      config.executable,
      pid,
      "success"
    );

    return pid;
  }

  /**
   * Check if a process is running
   * @param pid Process ID
   * @returns True if the process is running
   */
  isRunning(pid: number): boolean {
    const managed = this.processes.get(pid);
    return managed?.state === "running";
  }

  /**
   * Get managed process information
   * @param pid Process ID
   * @returns Managed process or undefined
   */
  getProcess(pid: number): ManagedProcess | undefined {
    return this.processes.get(pid);
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
   * Get all managed processes
   * @returns Array of managed processes
   */
  getAllProcesses(): ManagedProcess[] {
    return Array.from(this.processes.values());
  }

  /**
   * Extend the timeout for a running process
   * @param pid Process ID
   * @param additionalMs Additional milliseconds to add to timeout
   * @throws Error if process not found or timeout manager not available
   */
  extendTimeout(pid: number, additionalMs: number): void {
    if (!this.timeoutManager) {
      throw new ProcessError(
        "Timeout manager not available",
        "TIMEOUT_MANAGER_NOT_AVAILABLE"
      );
    }

    const managed = this.processes.get(pid);
    if (!managed) {
      throw new ProcessError(`Process ${pid} not found`, "PROCESS_NOT_FOUND");
    }

    if (managed.state !== "running") {
      throw new ProcessError(
        `Cannot extend timeout for non-running process ${pid}`,
        "PROCESS_NOT_RUNNING"
      );
    }

    this.timeoutManager.extendTimeout(pid, additionalMs);

    // Audit the timeout extension
    this.securityManager.auditOperation(
      "process_timeout_extend",
      managed.command,
      pid,
      `extended_by_${additionalMs}ms`
    );
  }

  /**
   * Setup output capture for a child process
   * @param child Child process
   * @param managed Managed process entry
   */
  private setupOutputCapture(
    child: ChildProcess,
    managed: ManagedProcess
  ): void {
    // Maximum buffer size per stream (10MB)
    const MAX_BUFFER_SIZE = 10 * 1024 * 1024;

    // Capture stdout
    if (child.stdout) {
      child.stdout.on("data", (data: Buffer) => {
        const currentSize = managed.outputBuffer.reduce(
          (sum, buf) => sum + buf.length,
          0
        );

        if (currentSize + data.length <= MAX_BUFFER_SIZE) {
          managed.outputBuffer.push(data);
        } else {
          // Discard oldest data to make room
          while (
            managed.outputBuffer.length > 0 &&
            currentSize + data.length > MAX_BUFFER_SIZE
          ) {
            const removed = managed.outputBuffer.shift();
            if (removed) {
              const newSize = currentSize - removed.length;
              if (newSize + data.length <= MAX_BUFFER_SIZE) {
                break;
              }
            }
          }
          managed.outputBuffer.push(data);
        }
      });
    }

    // Capture stderr
    if (child.stderr) {
      child.stderr.on("data", (data: Buffer) => {
        const currentSize = managed.errorBuffer.reduce(
          (sum, buf) => sum + buf.length,
          0
        );

        if (currentSize + data.length <= MAX_BUFFER_SIZE) {
          managed.errorBuffer.push(data);
        } else {
          // Discard oldest data to make room
          while (
            managed.errorBuffer.length > 0 &&
            currentSize + data.length > MAX_BUFFER_SIZE
          ) {
            const removed = managed.errorBuffer.shift();
            if (removed) {
              const newSize = currentSize - removed.length;
              if (newSize + data.length <= MAX_BUFFER_SIZE) {
                break;
              }
            }
          }
          managed.errorBuffer.push(data);
        }
      });
    }
  }
}
