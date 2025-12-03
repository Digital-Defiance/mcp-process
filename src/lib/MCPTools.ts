/**
 * MCP Tools - Tool implementations for the MCP Process Server
 *
 * Provides 12 MCP tools for process management:
 * 1. process_start - Launch a new process
 * 2. process_terminate - Terminate a process
 * 3. process_get_stats - Get resource usage statistics
 * 4. process_send_stdin - Send input to process stdin
 * 5. process_get_output - Get captured output
 * 6. process_list - List all managed processes
 * 7. process_get_status - Get process status
 * 8. process_create_group - Create a process group
 * 9. process_add_to_group - Add process to group
 * 10. process_terminate_group - Terminate all processes in group
 * 11. process_start_service - Start a long-running service
 * 12. process_stop_service - Stop a service
 */

import { z } from "zod";
import { ProcessLauncher } from "./ProcessLauncher";
import { ProcessManager } from "./ProcessManager";
import { ProcessTerminator } from "./ProcessTerminator";
import { ResourceMonitor } from "./ResourceMonitor";
import { IOManager } from "./IOManager";
import { ServiceManager } from "./ServiceManager";
import { SecurityManager } from "./SecurityManager";
import { TimeoutManager } from "./TimeoutManager";
import {
  ProcessConfig,
  ResourceLimits,
  ServiceConfig,
  RestartPolicy,
  HealthCheckConfig,
  ProcessError,
} from "../types";

/**
 * MCP Tools class
 * Provides all tool implementations for the MCP Process Server
 */
export class MCPTools {
  private processLauncher: ProcessLauncher;
  private processManager: ProcessManager;
  private processTerminator: ProcessTerminator;
  private resourceMonitor: ResourceMonitor;
  private ioManager: IOManager;
  private serviceManager: ServiceManager;
  private securityManager: SecurityManager;
  private timeoutManager: TimeoutManager;

  constructor(
    processLauncher: ProcessLauncher,
    processManager: ProcessManager,
    processTerminator: ProcessTerminator,
    resourceMonitor: ResourceMonitor,
    ioManager: IOManager,
    serviceManager: ServiceManager,
    securityManager: SecurityManager,
    timeoutManager: TimeoutManager
  ) {
    this.processLauncher = processLauncher;
    this.processManager = processManager;
    this.processTerminator = processTerminator;
    this.resourceMonitor = resourceMonitor;
    this.ioManager = ioManager;
    this.serviceManager = serviceManager;
    this.securityManager = securityManager;
    this.timeoutManager = timeoutManager;
  }

  /**
   * Tool 1: process_start
   * Launch a new process with specified configuration
   */
  async processStart(args: {
    executable: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
    captureOutput?: boolean;
    resourceLimits?: ResourceLimits;
  }): Promise<{
    status: string;
    pid: number;
    startTime: string;
  }> {
    const config: ProcessConfig = {
      executable: args.executable,
      args: args.args || [],
      cwd: args.cwd,
      env: args.env,
      timeout: args.timeout,
      captureOutput: args.captureOutput !== false,
      resourceLimits: args.resourceLimits,
    };

    const pid = await this.processLauncher.launch(config);
    const process = this.processLauncher.getProcess(pid);

    if (!process) {
      throw new ProcessError(
        "Process not found after launch",
        "PROCESS_NOT_FOUND"
      );
    }

    // Register with process manager
    const childProcess = this.processLauncher.getChildProcess(pid);
    this.processManager.register(process, childProcess);

    // Start resource monitoring if limits specified
    if (args.resourceLimits) {
      this.resourceMonitor.startMonitoring(pid, args.resourceLimits);
    }

    return {
      status: "success",
      pid,
      startTime: process.startTime.toISOString(),
    };
  }

  /**
   * Get the Zod schema for process_start tool
   */
  static getProcessStartSchema() {
    return {
      name: "process_start",
      description:
        "Launch a new process with specified arguments and environment",
      inputSchema: z.object({
        executable: z.string().describe("Path to executable"),
        args: z.array(z.string()).optional().describe("Command-line arguments"),
        cwd: z.string().optional().describe("Working directory"),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe("Environment variables"),
        timeout: z.number().optional().describe("Timeout in milliseconds"),
        captureOutput: z
          .boolean()
          .optional()
          .describe("Whether to capture output (default: true)"),
        resourceLimits: z
          .object({
            maxCpuPercent: z.number().optional(),
            maxMemoryMB: z.number().optional(),
            maxFileDescriptors: z.number().optional(),
            maxCpuTime: z.number().optional(),
            maxProcesses: z.number().optional(),
          })
          .optional()
          .describe("Resource limits"),
      }),
    };
  }

  /**
   * Tool 2: process_terminate
   * Terminate a process gracefully or forcefully
   */
  async processTerminate(args: {
    pid: number;
    force?: boolean;
    timeout?: number;
  }): Promise<{
    status: string;
    pid: number;
    exitCode?: number;
    terminationReason: string;
  }> {
    const managed = this.processManager.get(args.pid);
    if (!managed) {
      throw new ProcessError(
        `Process ${args.pid} not found`,
        "PROCESS_NOT_FOUND"
      );
    }

    // Validate signal target
    this.securityManager.validateSignalTarget(args.pid);

    const childProcess = this.processManager.getChildProcess(args.pid);
    if (!childProcess) {
      throw new ProcessError(
        `Child process ${args.pid} not found`,
        "CHILD_PROCESS_NOT_FOUND"
      );
    }

    let result;

    if (args.force) {
      // Force termination
      result = await this.processTerminator.terminateForcefully(args.pid);
    } else {
      // Graceful termination with optional timeout
      result = await this.processTerminator.terminateGracefully(
        args.pid,
        args.timeout || 5000
      );
    }

    // Stop resource monitoring
    this.resourceMonitor.stopMonitoring(args.pid);

    // Update managed process state
    managed.state = "stopped";
    managed.exitCode = result.exitCode;

    // Audit the operation
    this.securityManager.auditOperation(
      "process_terminate",
      managed.command,
      args.pid,
      args.force ? "forced" : "graceful"
    );

    return {
      status: "success",
      pid: args.pid,
      exitCode: result.exitCode,
      terminationReason: args.force ? "forced" : "graceful",
    };
  }

  /**
   * Get the Zod schema for process_terminate tool
   */
  static getProcessTerminateSchema() {
    return {
      name: "process_terminate",
      description: "Terminate a process gracefully or forcefully",
      inputSchema: z.object({
        pid: z.number().describe("Process ID"),
        force: z
          .boolean()
          .optional()
          .describe(
            "Force termination (SIGKILL) instead of graceful (SIGTERM)"
          ),
        timeout: z
          .number()
          .optional()
          .describe(
            "Timeout in milliseconds for graceful termination (default: 5000)"
          ),
      }),
    };
  }

  /**
   * Tool 3: process_get_stats
   * Get process resource usage statistics
   */
  async processGetStats(args: {
    pid: number;
    includeHistory?: boolean;
  }): Promise<{
    status: string;
    pid: number;
    state: string;
    uptime: number;
    stats: {
      cpuPercent: number;
      memoryMB: number;
      threadCount: number;
      ioRead: number;
      ioWrite: number;
    };
    history?: Array<{
      cpuPercent: number;
      memoryMB: number;
      threadCount: number;
      ioRead: number;
      ioWrite: number;
      uptime: number;
    }>;
  }> {
    const managed = this.processManager.get(args.pid);
    if (!managed) {
      throw new ProcessError(
        `Process ${args.pid} not found`,
        "PROCESS_NOT_FOUND"
      );
    }

    const stats = await this.resourceMonitor.getStats(args.pid);
    const uptime = (Date.now() - managed.startTime.getTime()) / 1000;

    const result: any = {
      status: "success",
      pid: args.pid,
      state: managed.state,
      uptime,
      stats: {
        cpuPercent: stats.cpuPercent,
        memoryMB: stats.memoryMB,
        threadCount: stats.threadCount,
        ioRead: stats.ioRead,
        ioWrite: stats.ioWrite,
      },
    };

    if (args.includeHistory) {
      result.history = this.resourceMonitor.getHistory(args.pid);
    }

    return result;
  }

  /**
   * Get the Zod schema for process_get_stats tool
   */
  static getProcessGetStatsSchema() {
    return {
      name: "process_get_stats",
      description: "Get process resource usage statistics",
      inputSchema: z.object({
        pid: z.number().describe("Process ID"),
        includeHistory: z
          .boolean()
          .optional()
          .describe("Include historical data (default: false)"),
      }),
    };
  }

  /**
   * Tool 4: process_send_stdin
   * Send input to process stdin
   */
  async processSendStdin(args: {
    pid: number;
    data: string;
    encoding?: string;
  }): Promise<{
    status: string;
    bytesWritten: number;
  }> {
    const managed = this.processManager.get(args.pid);
    if (!managed) {
      throw new ProcessError(
        `Process ${args.pid} not found`,
        "PROCESS_NOT_FOUND"
      );
    }

    const bytesWritten = await this.ioManager.writeStdin(
      args.pid,
      args.data,
      (args.encoding as BufferEncoding) || "utf-8"
    );

    return {
      status: "success",
      bytesWritten,
    };
  }

  /**
   * Get the Zod schema for process_send_stdin tool
   */
  static getProcessSendStdinSchema() {
    return {
      name: "process_send_stdin",
      description: "Send input to process stdin",
      inputSchema: z.object({
        pid: z.number().describe("Process ID"),
        data: z.string().describe("Data to send to stdin"),
        encoding: z
          .string()
          .optional()
          .describe("Text encoding (default: utf-8)"),
      }),
    };
  }

  /**
   * Tool 5: process_get_output
   * Get captured process output
   */
  async processGetOutput(args: {
    pid: number;
    stream?: "stdout" | "stderr" | "both";
    encoding?: string;
  }): Promise<{
    status: string;
    pid: number;
    stdout?: string;
    stderr?: string;
    stdoutBytes: number;
    stderrBytes: number;
  }> {
    const managed = this.processManager.get(args.pid);
    if (!managed) {
      throw new ProcessError(
        `Process ${args.pid} not found`,
        "PROCESS_NOT_FOUND"
      );
    }

    const stream = args.stream || "both";
    const encoding = (args.encoding as BufferEncoding) || "utf-8";

    let stdout: string | undefined;
    let stderr: string | undefined;
    let stdoutBytes = 0;
    let stderrBytes = 0;

    if (stream === "stdout" || stream === "both") {
      const stdoutResult = this.ioManager.getStdout(args.pid, encoding);
      stdout = stdoutResult.content;
      stdoutBytes = stdoutResult.bytes;
    }

    if (stream === "stderr" || stream === "both") {
      const stderrResult = this.ioManager.getStderr(args.pid, encoding);
      stderr = stderrResult.content;
      stderrBytes = stderrResult.bytes;
    }

    return {
      status: "success",
      pid: args.pid,
      stdout,
      stderr,
      stdoutBytes,
      stderrBytes,
    };
  }

  /**
   * Get the Zod schema for process_get_output tool
   */
  static getProcessGetOutputSchema() {
    return {
      name: "process_get_output",
      description: "Get captured process output",
      inputSchema: z.object({
        pid: z.number().describe("Process ID"),
        stream: z
          .enum(["stdout", "stderr", "both"])
          .optional()
          .describe("Which stream to retrieve (default: both)"),
        encoding: z
          .string()
          .optional()
          .describe("Text encoding (default: utf-8)"),
      }),
    };
  }

  /**
   * Tool 6: process_list
   * List all managed processes
   */
  async processList(): Promise<{
    status: string;
    processes: Array<{
      pid: number;
      command: string;
      args: string[];
      state: string;
      startTime: string;
      uptime: number;
    }>;
  }> {
    const processes = this.processManager.getAll();

    return {
      status: "success",
      processes: processes.map((p) => ({
        pid: p.pid,
        command: p.command,
        args: p.args,
        state: p.state,
        startTime: p.startTime.toISOString(),
        uptime: (Date.now() - p.startTime.getTime()) / 1000,
      })),
    };
  }

  /**
   * Get the Zod schema for process_list tool
   */
  static getProcessListSchema() {
    return {
      name: "process_list",
      description: "List all managed processes",
      inputSchema: z.object({}),
    };
  }

  /**
   * Tool 7: process_get_status
   * Get process status information
   */
  async processGetStatus(args: { pid: number }): Promise<{
    status: string;
    pid: number;
    command: string;
    args: string[];
    state: string;
    uptime: number;
    startTime: string;
    exitCode?: number;
    stats: {
      cpuPercent: number;
      memoryMB: number;
      threadCount: number;
      ioRead: number;
      ioWrite: number;
    };
  }> {
    const managed = this.processManager.get(args.pid);
    if (!managed) {
      throw new ProcessError(
        `Process ${args.pid} not found`,
        "PROCESS_NOT_FOUND"
      );
    }

    const uptime = (Date.now() - managed.startTime.getTime()) / 1000;

    return {
      status: "success",
      pid: args.pid,
      command: managed.command,
      args: managed.args,
      state: managed.state,
      uptime,
      startTime: managed.startTime.toISOString(),
      exitCode: managed.exitCode,
      stats: {
        cpuPercent: managed.stats.cpuPercent,
        memoryMB: managed.stats.memoryMB,
        threadCount: managed.stats.threadCount,
        ioRead: managed.stats.ioRead,
        ioWrite: managed.stats.ioWrite,
      },
    };
  }

  /**
   * Get the Zod schema for process_get_status tool
   */
  static getProcessGetStatusSchema() {
    return {
      name: "process_get_status",
      description: "Get process status information",
      inputSchema: z.object({
        pid: z.number().describe("Process ID"),
      }),
    };
  }

  /**
   * Tool 8: process_create_group
   * Create a process group
   */
  async processCreateGroup(args: {
    name: string;
    pipeline?: boolean;
  }): Promise<{
    status: string;
    groupId: string;
    name: string;
  }> {
    const groupId = this.processManager.createGroup(
      args.name,
      args.pipeline || false
    );

    return {
      status: "success",
      groupId,
      name: args.name,
    };
  }

  /**
   * Get the Zod schema for process_create_group tool
   */
  static getProcessCreateGroupSchema() {
    return {
      name: "process_create_group",
      description: "Create a process group",
      inputSchema: z.object({
        name: z.string().describe("Group name"),
        pipeline: z
          .boolean()
          .optional()
          .describe("Whether this is a pipeline group (default: false)"),
      }),
    };
  }

  /**
   * Tool 9: process_add_to_group
   * Add a process to a group
   */
  async processAddToGroup(args: { groupId: string; pid: number }): Promise<{
    status: string;
    groupId: string;
    pid: number;
  }> {
    this.processManager.addToGroup(args.groupId, args.pid);

    return {
      status: "success",
      groupId: args.groupId,
      pid: args.pid,
    };
  }

  /**
   * Get the Zod schema for process_add_to_group tool
   */
  static getProcessAddToGroupSchema() {
    return {
      name: "process_add_to_group",
      description: "Add a process to a group",
      inputSchema: z.object({
        groupId: z.string().describe("Group ID"),
        pid: z.number().describe("Process ID"),
      }),
    };
  }

  /**
   * Tool 10: process_terminate_group
   * Terminate all processes in a group
   */
  async processTerminateGroup(args: { groupId: string }): Promise<{
    status: string;
    groupId: string;
    terminatedPids: number[];
  }> {
    const group = this.processManager.getGroup(args.groupId);
    if (!group) {
      throw new ProcessError(
        `Group ${args.groupId} not found`,
        "GROUP_NOT_FOUND"
      );
    }

    const terminatedPids: number[] = [];

    // Terminate all processes in the group
    for (const pid of group.processes) {
      try {
        await this.processTerminate({ pid, force: false });
        terminatedPids.push(pid);
      } catch (error) {
        console.error(`Error terminating process ${pid}:`, error);
      }
    }

    // Delete the group
    this.processManager.deleteGroup(args.groupId);

    return {
      status: "success",
      groupId: args.groupId,
      terminatedPids,
    };
  }

  /**
   * Get the Zod schema for process_terminate_group tool
   */
  static getProcessTerminateGroupSchema() {
    return {
      name: "process_terminate_group",
      description: "Terminate all processes in a group",
      inputSchema: z.object({
        groupId: z.string().describe("Group ID"),
      }),
    };
  }

  /**
   * Tool 11: process_start_service
   * Start a long-running service with auto-restart
   */
  async processStartService(args: {
    name: string;
    executable: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    resourceLimits?: ResourceLimits;
    healthCheck?: {
      command: string;
      interval: number;
      timeout: number;
    };
    restartPolicy?: {
      enabled: boolean;
      maxRetries: number;
      backoffMs: number;
    };
  }): Promise<{
    status: string;
    serviceId: string;
    pid: number;
  }> {
    const config: ServiceConfig = {
      name: args.name,
      executable: args.executable,
      args: args.args || [],
      cwd: args.cwd,
      env: args.env,
      resourceLimits: args.resourceLimits,
      captureOutput: true,
      healthCheck: args.healthCheck as HealthCheckConfig | undefined,
      restartPolicy: args.restartPolicy || {
        enabled: true,
        maxRetries: 3,
        backoffMs: 1000,
      },
    };

    const serviceId = await this.serviceManager.startService(config);
    const service = this.serviceManager.getService(serviceId);

    if (!service || !service.pid) {
      throw new ProcessError(
        "Service not found after start",
        "SERVICE_NOT_FOUND"
      );
    }

    return {
      status: "success",
      serviceId,
      pid: service.pid,
    };
  }

  /**
   * Get the Zod schema for process_start_service tool
   */
  static getProcessStartServiceSchema() {
    return {
      name: "process_start_service",
      description:
        "Start a long-running service with auto-restart and health monitoring",
      inputSchema: z.object({
        name: z.string().describe("Service name"),
        executable: z.string().describe("Path to executable"),
        args: z.array(z.string()).optional().describe("Command-line arguments"),
        cwd: z.string().optional().describe("Working directory"),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe("Environment variables"),
        resourceLimits: z
          .object({
            maxCpuPercent: z.number().optional(),
            maxMemoryMB: z.number().optional(),
            maxFileDescriptors: z.number().optional(),
            maxCpuTime: z.number().optional(),
            maxProcesses: z.number().optional(),
          })
          .optional()
          .describe("Resource limits"),
        healthCheck: z
          .object({
            command: z.string().describe("Health check command"),
            interval: z
              .number()
              .describe("Interval between checks in milliseconds"),
            timeout: z
              .number()
              .describe("Timeout for health check in milliseconds"),
          })
          .optional()
          .describe("Health check configuration"),
        restartPolicy: z
          .object({
            enabled: z.boolean().describe("Enable auto-restart"),
            maxRetries: z.number().describe("Maximum restart attempts"),
            backoffMs: z.number().describe("Backoff delay in milliseconds"),
          })
          .optional()
          .describe(
            "Restart policy (default: enabled=true, maxRetries=3, backoffMs=1000)"
          ),
      }),
    };
  }

  /**
   * Tool 12: process_stop_service
   * Stop a service and disable auto-restart
   */
  async processStopService(args: { serviceId: string }): Promise<{
    status: string;
    serviceId: string;
  }> {
    await this.serviceManager.stopService(args.serviceId);

    return {
      status: "success",
      serviceId: args.serviceId,
    };
  }

  /**
   * Get the Zod schema for process_stop_service tool
   */
  static getProcessStopServiceSchema() {
    return {
      name: "process_stop_service",
      description: "Stop a service and disable auto-restart",
      inputSchema: z.object({
        serviceId: z.string().describe("Service ID (service name)"),
      }),
    };
  }

  /**
   * Get all tool schemas
   */
  static getAllSchemas() {
    return [
      MCPTools.getProcessStartSchema(),
      MCPTools.getProcessTerminateSchema(),
      MCPTools.getProcessGetStatsSchema(),
      MCPTools.getProcessSendStdinSchema(),
      MCPTools.getProcessGetOutputSchema(),
      MCPTools.getProcessListSchema(),
      MCPTools.getProcessGetStatusSchema(),
      MCPTools.getProcessCreateGroupSchema(),
      MCPTools.getProcessAddToGroupSchema(),
      MCPTools.getProcessTerminateGroupSchema(),
      MCPTools.getProcessStartServiceSchema(),
      MCPTools.getProcessStopServiceSchema(),
    ];
  }
}
