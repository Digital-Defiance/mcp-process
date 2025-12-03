/**
 * ProcessManager - Property-Based Tests
 *
 * Feature: mcp-process
 */

import * as fc from "fast-check";
import { ProcessManager } from "./ProcessManager";
import { ManagedProcess, ProcessState } from "../types";

describe("ProcessManager", () => {
  describe("Property 9: Process status completeness", () => {
    /**
     * Feature: mcp-process, Property 9: Process status completeness
     *
     * For any process, when status is queried, the response should include running state, uptime, and resource usage.
     * Validates: Requirements 6.1
     */
    it("should return complete status information for any registered process", () => {
      fc.assert(
        fc.property(
          // Generate arbitrary process data
          fc.integer({ min: 1, max: 999999 }), // pid
          fc.string({ minLength: 1, maxLength: 50 }), // command
          fc.array(fc.string(), { maxLength: 10 }), // args
          fc.constantFrom<ProcessState>("running", "stopped", "crashed"), // state
          fc.integer({ min: 0, max: 1000000 }), // start time offset (ms ago)
          fc.option(fc.integer({ min: 0, max: 255 })), // exit code
          fc.record({
            cpuPercent: fc.double({ min: 0, max: 100 }),
            memoryMB: fc.double({ min: 0, max: 16384 }),
            threadCount: fc.integer({ min: 1, max: 1000 }),
            ioRead: fc.integer({ min: 0, max: 1000000000 }),
            ioWrite: fc.integer({ min: 0, max: 1000000000 }),
            uptime: fc.double({ min: 0, max: 86400 }),
          }), // stats
          (pid, command, args, state, startTimeOffset, exitCode, stats) => {
            const manager = new ProcessManager();

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

            manager.register(process);

            const status = manager.getStatus(pid);

            // Status should exist
            expect(status).toBeDefined();

            if (status) {
              // Should include state
              expect(status.state).toBe(state);

              // Should include uptime (non-negative number)
              expect(typeof status.uptime).toBe("number");
              expect(status.uptime).toBeGreaterThanOrEqual(0);

              // Should include resource usage stats
              expect(status.stats).toBeDefined();
              expect(typeof status.stats.cpuPercent).toBe("number");
              expect(typeof status.stats.memoryMB).toBe("number");
              expect(typeof status.stats.threadCount).toBe("number");
              expect(typeof status.stats.ioRead).toBe("number");
              expect(typeof status.stats.ioWrite).toBe("number");

              // Should include exit code if process terminated
              if (state === "stopped" || state === "crashed") {
                if (exitCode !== null) {
                  expect(status.exitCode).toBe(exitCode);
                }
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 10: Process list completeness", () => {
    /**
     * Feature: mcp-process, Property 10: Process list completeness
     *
     * For any process list request, all managed processes should be returned with their PIDs, commands, and states.
     * Validates: Requirements 6.2
     */
    it("should return all registered processes with complete information", () => {
      fc.assert(
        fc.property(
          // Generate an array of process data
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
              startTime: fc.date(),
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
            { minLength: 0, maxLength: 20 }
          ),
          (processesData) => {
            const manager = new ProcessManager();

            // Register all processes
            const registeredPids = new Set<number>();
            for (const data of processesData) {
              // Skip duplicate PIDs
              if (registeredPids.has(data.pid)) {
                continue;
              }

              const process: ManagedProcess = {
                ...data,
                exitCode: data.exitCode ?? undefined,
                outputBuffer: [],
                errorBuffer: [],
              };

              manager.register(process);
              registeredPids.add(data.pid);
            }

            const allProcesses = manager.getAll();

            // Should return correct number of processes
            expect(allProcesses.length).toBe(registeredPids.size);

            // Each process should have complete information
            for (const process of allProcesses) {
              expect(typeof process.pid).toBe("number");
              expect(process.pid).toBeGreaterThan(0);

              expect(typeof process.command).toBe("string");
              expect(process.command.length).toBeGreaterThan(0);

              expect(Array.isArray(process.args)).toBe(true);

              expect(["running", "stopped", "crashed"]).toContain(
                process.state
              );

              expect(process.startTime).toBeInstanceOf(Date);

              expect(process.stats).toBeDefined();
            }

            // All registered PIDs should be in the list
            const returnedPids = new Set(allProcesses.map((p) => p.pid));
            for (const pid of registeredPids) {
              expect(returnedPids.has(pid)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 17: Concurrent process limit enforcement", () => {
    /**
     * Feature: mcp-process, Property 17: Concurrent process limit enforcement
     *
     * For any configured maximum concurrent processes, when that limit is reached, new launch requests should be rejected.
     * Validates: Requirements 14.3
     *
     * Note: This property tests the ProcessManager's ability to track running processes.
     * The actual limit enforcement is done by SecurityManager.checkConcurrentLimit()
     * which queries the number of running processes.
     */
    it("should accurately track running process count for limit enforcement", () => {
      fc.assert(
        fc.property(
          // Generate a set of processes with varying states
          fc.array(
            fc.record({
              pid: fc.integer({ min: 1, max: 999999 }),
              command: fc.string({ minLength: 1, maxLength: 50 }),
              args: fc.array(fc.string(), { maxLength: 5 }),
              state: fc.constantFrom<ProcessState>(
                "running",
                "stopped",
                "crashed"
              ),
              startTime: fc.date(),
              stats: fc.record({
                cpuPercent: fc.double({ min: 0, max: 100 }),
                memoryMB: fc.double({ min: 0, max: 16384 }),
                threadCount: fc.integer({ min: 1, max: 100 }),
                ioRead: fc.integer({ min: 0, max: 1000000 }),
                ioWrite: fc.integer({ min: 0, max: 1000000 }),
                uptime: fc.double({ min: 0, max: 3600 }),
              }),
            }),
            { minLength: 0, maxLength: 50 }
          ),
          (processesData) => {
            const manager = new ProcessManager();

            // Register all processes (avoiding duplicate PIDs)
            const registeredPids = new Set<number>();
            let expectedRunningCount = 0;

            for (const data of processesData) {
              if (registeredPids.has(data.pid)) {
                continue;
              }

              const process: ManagedProcess = {
                ...data,
                outputBuffer: [],
                errorBuffer: [],
              };

              manager.register(process);
              registeredPids.add(data.pid);

              if (data.state === "running") {
                expectedRunningCount++;
              }
            }

            // The running count should match the number of processes in "running" state
            const actualRunningCount = manager.getRunningCount();
            expect(actualRunningCount).toBe(expectedRunningCount);

            // Verify by checking all processes
            const allProcesses = manager.getAll();
            const runningProcesses = allProcesses.filter(
              (p) => p.state === "running"
            );
            expect(runningProcesses.length).toBe(expectedRunningCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
