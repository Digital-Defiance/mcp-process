/**
 * MCPTools - Property-based tests
 *
 * Tests the MCP tool implementations for correctness properties
 */

import * as fc from "fast-check";
import { MCPTools } from "./MCPTools";
import { ProcessLauncher } from "./ProcessLauncher";
import { ProcessManager } from "./ProcessManager";
import { ProcessTerminator } from "./ProcessTerminator";
import { ResourceMonitor } from "./ResourceMonitor";
import { IOManager } from "./IOManager";
import { ServiceManager } from "./ServiceManager";
import { SecurityManager } from "./SecurityManager";
import { TimeoutManager } from "./TimeoutManager";
import { SecurityConfig, ProcessState, ManagedProcess } from "../types";

describe("MCPTools", () => {
  let mcpTools: MCPTools;
  let processLauncher: ProcessLauncher;
  let processManager: ProcessManager;
  let processTerminator: ProcessTerminator;
  let resourceMonitor: ResourceMonitor;
  let ioManager: IOManager;
  let serviceManager: ServiceManager;
  let securityManager: SecurityManager;
  let timeoutManager: TimeoutManager;

  beforeEach(() => {
    // Create security config
    const securityConfig: SecurityConfig = {
      allowedExecutables: ["node", "echo", "cat", "sleep"],
      blockSetuidExecutables: true,
      blockShellInterpreters: false,
      defaultResourceLimits: {
        maxCpuPercent: 80,
        maxMemoryMB: 1024,
        maxCpuTime: 300,
      },
      maxConcurrentProcesses: 10,
      maxProcessLifetime: 3600,
      enableAuditLog: false,
      requireConfirmation: false,
      allowProcessTermination: true,
      allowGroupTermination: true,
      allowForcedTermination: true,
      allowStdinInput: true,
      allowOutputCapture: true,
    };

    // Initialize components
    securityManager = new SecurityManager(securityConfig);
    timeoutManager = new TimeoutManager();
    processLauncher = new ProcessLauncher(securityManager, timeoutManager);
    processManager = new ProcessManager();
    processTerminator = new ProcessTerminator();
    resourceMonitor = new ResourceMonitor();
    ioManager = new IOManager();
    serviceManager = new ServiceManager(processLauncher, securityManager);

    // Create MCPTools instance
    mcpTools = new MCPTools(
      processLauncher,
      processManager,
      processTerminator,
      resourceMonitor,
      ioManager,
      serviceManager,
      securityManager,
      timeoutManager
    );
  });

  describe("Property 16: Process information completeness", () => {
    /**
     * Feature: mcp-process, Property 16: Process information completeness
     *
     * For any process information request, the response should include PID, command, state, uptime, and resource usage.
     * Validates: Requirements 13.3
     */
    it("should return complete process information for any registered process", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.string(), { maxLength: 10 }),
          fc.constantFrom<ProcessState>("running", "stopped", "crashed"),
          fc.integer({ min: 0, max: 1000000 }),
          fc.option(fc.integer({ min: 0, max: 255 })),
          fc.record({
            cpuPercent: fc.double({ min: 0, max: 100 }),
            memoryMB: fc.double({ min: 0, max: 16384 }),
            threadCount: fc.integer({ min: 1, max: 1000 }),
            ioRead: fc.integer({ min: 0, max: 1000000000 }),
            ioWrite: fc.integer({ min: 0, max: 1000000000 }),
            uptime: fc.double({ min: 0, max: 86400 }),
          }),
          async (
            pid,
            command,
            args,
            state,
            startTimeOffset,
            exitCode,
            stats
          ) => {
            const process: ManagedProcess = {
              pid,
              command,
              args,
              state,
              startTime: new Date(Date.now() - startTimeOffset),
              exitCode: exitCode ?? undefined,
              stats,
              outputBuffer: [],
              errorBuffer: [],
            };

            processManager.register(process);

            const result = await mcpTools.processGetStatus({ pid });

            expect(result.status).toBe("success");
            expect(result.pid).toBe(pid);
            expect(typeof result.pid).toBe("number");
            expect(result.command).toBe(command);
            expect(typeof result.command).toBe("string");
            expect(result.args).toEqual(args);
            expect(Array.isArray(result.args)).toBe(true);
            expect(result.state).toBe(state);
            expect(typeof result.state).toBe("string");
            expect(typeof result.uptime).toBe("number");
            expect(result.uptime).toBeGreaterThanOrEqual(0);
            expect(result.startTime).toBeDefined();
            expect(typeof result.startTime).toBe("string");
            expect(() => new Date(result.startTime)).not.toThrow();
            expect(result.stats).toBeDefined();
            expect(typeof result.stats.cpuPercent).toBe("number");
            expect(typeof result.stats.memoryMB).toBe("number");
            expect(typeof result.stats.threadCount).toBe("number");
            expect(typeof result.stats.ioRead).toBe("number");
            expect(typeof result.stats.ioWrite).toBe("number");

            if (state === "stopped" || state === "crashed") {
              if (exitCode !== null) {
                expect(result.exitCode).toBe(exitCode);
              }
            }

            processManager.unregister(pid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return complete process information from process_list for any set of processes", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              pid: fc.integer({ min: 1, max: 999999 }),
              command: fc.string({ minLength: 1, maxLength: 50 }),
              args: fc.array(fc.string(), { maxLength: 10 }),
              state: fc.constantFrom<ProcessState>(
                "running",
                "stopped",
                "crashed"
              ),
              startTimeOffset: fc.integer({ min: 0, max: 1000000 }),
              exitCode: fc.option(fc.integer({ min: 0, max: 255 })),
              stats: fc.record({
                cpuPercent: fc.double({ min: 0, max: 100 }),
                memoryMB: fc.double({ min: 0, max: 16384 }),
                threadCount: fc.integer({ min: 1, max: 1000 }),
                ioRead: fc.integer({ min: 0, max: 1000000000 }),
                ioWrite: fc.integer({ min: 0, max: 1000000000 }),
                uptime: fc.double({ min: 0, max: 86400 }),
              }),
            }),
            { minLength: 0, maxLength: 10 }
          ),
          async (processDataArray) => {
            const registeredPids: Set<number> = new Set();
            for (const data of processDataArray) {
              const process: ManagedProcess = {
                pid: data.pid,
                command: data.command,
                args: data.args,
                state: data.state,
                startTime: new Date(Date.now() - data.startTimeOffset),
                exitCode: data.exitCode ?? undefined,
                stats: data.stats,
                outputBuffer: [],
                errorBuffer: [],
              };

              processManager.register(process);
              registeredPids.add(data.pid);
            }

            const result = await mcpTools.processList();

            expect(result.status).toBe("success");
            expect(result.processes).toBeDefined();
            expect(Array.isArray(result.processes)).toBe(true);
            // Should return at least as many processes as unique PIDs registered
            expect(result.processes.length).toBeGreaterThanOrEqual(
              registeredPids.size
            );

            for (const proc of result.processes) {
              if (registeredPids.has(proc.pid)) {
                expect(typeof proc.pid).toBe("number");
                expect(typeof proc.command).toBe("string");
                expect(Array.isArray(proc.args)).toBe(true);
                expect(typeof proc.state).toBe("string");
                expect(["running", "stopped", "crashed"]).toContain(proc.state);
                expect(typeof proc.startTime).toBe("string");
                expect(() => new Date(proc.startTime)).not.toThrow();
                expect(typeof proc.uptime).toBe("number");
                expect(proc.uptime).toBeGreaterThanOrEqual(0);
              }
            }

            for (const pid of Array.from(registeredPids)) {
              processManager.unregister(pid);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should return complete statistics information from process_get_stats", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 999999 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.array(fc.string(), { maxLength: 10 }),
          fc.constantFrom<ProcessState>("running", "stopped", "crashed"),
          fc.integer({ min: 0, max: 1000000 }),
          fc.record({
            cpuPercent: fc.double({ min: 0, max: 100 }),
            memoryMB: fc.double({ min: 0, max: 16384 }),
            threadCount: fc.integer({ min: 1, max: 1000 }),
            ioRead: fc.integer({ min: 0, max: 1000000000 }),
            ioWrite: fc.integer({ min: 0, max: 1000000000 }),
            uptime: fc.double({ min: 0, max: 86400 }),
          }),
          fc.boolean(),
          async (
            pid,
            command,
            args,
            state,
            startTimeOffset,
            stats,
            includeHistory
          ) => {
            const process: ManagedProcess = {
              pid,
              command,
              args,
              state,
              startTime: new Date(Date.now() - startTimeOffset),
              stats,
              outputBuffer: [],
              errorBuffer: [],
            };

            processManager.register(process);

            jest.spyOn(resourceMonitor, "getStats").mockResolvedValue(stats);
            if (includeHistory) {
              jest
                .spyOn(resourceMonitor, "getHistory")
                .mockReturnValue([stats]);
            }

            const result = await mcpTools.processGetStats({
              pid,
              includeHistory,
            });

            expect(result.status).toBe("success");
            expect(result.pid).toBe(pid);
            expect(result.state).toBe(state);
            expect(typeof result.uptime).toBe("number");
            expect(result.uptime).toBeGreaterThanOrEqual(0);
            expect(result.stats).toBeDefined();
            expect(typeof result.stats.cpuPercent).toBe("number");
            expect(typeof result.stats.memoryMB).toBe("number");
            expect(typeof result.stats.threadCount).toBe("number");
            expect(typeof result.stats.ioRead).toBe("number");
            expect(typeof result.stats.ioWrite).toBe("number");

            if (includeHistory) {
              expect(result.history).toBeDefined();
              expect(Array.isArray(result.history)).toBe(true);
            }

            processManager.unregister(pid);
            jest.restoreAllMocks();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
