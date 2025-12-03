/**
 * ProcessGroup - Property-Based Tests
 *
 * Feature: mcp-process
 */

import * as fc from "fast-check";
import { ProcessGroupManager } from "./ProcessGroup";
import { ProcessManager } from "./ProcessManager";
import { ProcessLauncher } from "./ProcessLauncher";
import { ProcessTerminator } from "./ProcessTerminator";
import { SecurityManager } from "./SecurityManager";
import { ProcessConfig, SecurityConfig } from "../types";

// Helper to create a test security config
function createTestSecurityConfig(): SecurityConfig {
  return {
    allowedExecutables: [
      "node",
      "sleep",
      "echo",
      "/usr/bin/sleep",
      "/bin/sleep",
    ],
    defaultResourceLimits: {
      maxCpuPercent: 80,
      maxMemoryMB: 1024,
    },
    maxConcurrentProcesses: 20,
    maxProcessLifetime: 3600,
    enableAuditLog: false,
    requireConfirmation: false,
    blockSetuidExecutables: true,
    blockShellInterpreters: false,
    allowProcessTermination: true,
    allowGroupTermination: true,
    allowForcedTermination: true,
    allowStdinInput: true,
    allowOutputCapture: true,
  };
}

// Helper to wait for process to exit
function waitForExit(pid: number, timeout: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      try {
        process.kill(pid, 0); // Check if process exists
      } catch (error) {
        clearInterval(checkInterval);
        resolve();
        return;
      }

      if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error("Timeout waiting for process to exit"));
      }
    }, 100);
  });
}

describe("ProcessGroup", () => {
  describe("Group management", () => {
    it("should create and manage process groups", () => {
      const processGroup = new ProcessGroupManager();

      // Create a group
      const groupId = processGroup.createGroup("test-group", false);
      expect(groupId).toBeDefined();
      expect(typeof groupId).toBe("string");

      // Get the group
      const group = processGroup.getGroup(groupId);
      expect(group).toBeDefined();
      expect(group?.name).toBe("test-group");
      expect(group?.pipeline).toBe(false);
      expect(group?.processes).toEqual([]);
    });

    it("should add and remove processes from groups", () => {
      const processGroup = new ProcessGroupManager();
      const groupId = processGroup.createGroup("test-group", false);

      // Add processes
      processGroup.addToGroup(groupId, 1234);
      processGroup.addToGroup(groupId, 5678);

      const group = processGroup.getGroup(groupId);
      expect(group?.processes).toEqual([1234, 5678]);

      // Remove a process
      processGroup.removeFromGroup(groupId, 1234);
      const updatedGroup = processGroup.getGroup(groupId);
      expect(updatedGroup?.processes).toEqual([5678]);
    });

    it("should delete groups", () => {
      const processGroup = new ProcessGroupManager();
      const groupId = processGroup.createGroup("test-group", false);

      expect(processGroup.getGroup(groupId)).toBeDefined();

      const deleted = processGroup.deleteGroup(groupId);
      expect(deleted).toBe(true);
      expect(processGroup.getGroup(groupId)).toBeUndefined();
    });
  });

  describe("Property 14: Process group termination", () => {
    /**
     * Feature: mcp-process, Property 14: Process group termination
     *
     * For any process group, when group termination is requested, all processes in the group should be terminated.
     * Validates: Requirements 10.4
     */
    it("should terminate all processes when group termination is requested", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // number of processes in group
          fc.boolean(), // force termination flag
          async (processCount, force) => {
            const securityConfig = createTestSecurityConfig();
            const securityManager = new SecurityManager(securityConfig);
            const launcher = new ProcessLauncher(securityManager);
            const processManager = new ProcessManager();
            const terminator = new ProcessTerminator(
              launcher,
              securityManager,
              processManager
            );

            // Launch multiple processes
            const pids: number[] = [];
            for (let i = 0; i < processCount; i++) {
              const config: ProcessConfig = {
                executable: "node",
                args: ["-e", "setInterval(function() {}, 1000)"],
                captureOutput: true,
              };
              const pid = await launcher.launch(config);
              pids.push(pid);

              // Register with process manager
              const managed = launcher.getProcess(pid);
              const childProcess = launcher.getChildProcess(pid);
              if (managed && childProcess) {
                processManager.register(managed, childProcess);
              }
            }

            try {
              // Give processes time to start
              await new Promise((resolve) => setTimeout(resolve, 200));

              // Create a process group
              const groupId = processManager.createGroup("test-group", false);

              // Add all processes to the group
              for (const pid of pids) {
                processManager.addToGroup(groupId, pid);
              }

              // Verify all processes are in the group
              const group = processManager.getGroup(groupId);
              expect(group?.processes).toHaveLength(processCount);
              pids.forEach((pid) => {
                expect(group?.processes).toContain(pid);
              });

              // Verify all processes are running
              pids.forEach((pid) => {
                expect(launcher.isRunning(pid)).toBe(true);
              });

              // Terminate the group
              const results = await terminator.terminateGroupById(
                groupId,
                force,
                1000
              );

              // Verify all terminations were successful
              expect(results).toHaveLength(processCount);
              results.forEach((result) => {
                expect(result.success).toBe(true);
                expect(pids).toContain(result.pid);
              });

              // Wait for all processes to exit
              await Promise.all(pids.map((pid) => waitForExit(pid, 2000)));

              // Verify all processes are no longer running
              pids.forEach((pid) => {
                expect(launcher.isRunning(pid)).toBe(false);
              });
            } catch (error) {
              // Clean up if test fails
              pids.forEach((pid) => {
                try {
                  process.kill(pid, "SIGKILL");
                } catch (e) {
                  // Process may already be dead
                }
              });
              throw error;
            }
          }
        ),
        { numRuns: 10 } // Run 10 times for faster tests with real processes
      );
    });

    it("should handle empty groups gracefully", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const processManager = new ProcessManager();
      const terminator = new ProcessTerminator(
        launcher,
        securityManager,
        processManager
      );

      // Create an empty group
      const groupId = processManager.createGroup("empty-group", false);

      // Terminate the empty group
      const results = await terminator.terminateGroupById(groupId, false, 1000);

      // Should return empty array
      expect(results).toHaveLength(0);
    });

    it("should handle groups with already terminated processes", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const processManager = new ProcessManager();
      const terminator = new ProcessTerminator(
        launcher,
        securityManager,
        processManager
      );

      // Launch a process that exits quickly
      const config: ProcessConfig = {
        executable: "node",
        args: ["-e", "process.exit(0)"],
        captureOutput: true,
      };
      const pid = await launcher.launch(config);

      // Register with process manager
      const managed = launcher.getProcess(pid);
      const childProcess = launcher.getChildProcess(pid);
      if (managed && childProcess) {
        processManager.register(managed, childProcess);
      }

      // Create a group and add the process
      const groupId = processManager.createGroup("test-group", false);
      processManager.addToGroup(groupId, pid);

      // Wait for process to exit
      await waitForExit(pid, 1000);

      // Terminate the group (process already exited)
      const results = await terminator.terminateGroupById(groupId, false, 1000);

      // Should return result for the process
      // The termination may succeed (if process state is tracked) or fail (if process doesn't exist)
      // Both are acceptable for already-terminated processes
      expect(results).toHaveLength(1);
      expect(results[0].pid).toBe(pid);
      // Don't check success flag as it depends on timing
    });
  });

  describe("Pipeline functionality", () => {
    it("should create pipeline groups", () => {
      const processGroup = new ProcessGroupManager();

      // Create a pipeline group
      const groupId = processGroup.createGroup("test-pipeline", true);

      const group = processGroup.getGroup(groupId);
      expect(group?.pipeline).toBe(true);
      expect(processGroup.isPipeline(groupId)).toBe(true);
    });

    it("should track pipeline connections", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const processManager = new ProcessManager();

      // Launch two processes for pipeline
      const config1: ProcessConfig = {
        executable: "echo",
        args: ["hello"],
        captureOutput: true,
      };
      const pid1 = await launcher.launch(config1);

      const config2: ProcessConfig = {
        executable: "node",
        args: [
          "-e",
          "process.stdin.on('data', d => console.log(d.toString()))",
        ],
        captureOutput: true,
      };
      const pid2 = await launcher.launch(config2);

      try {
        // Register with process manager
        const managed1 = launcher.getProcess(pid1);
        const childProcess1 = launcher.getChildProcess(pid1);
        if (managed1 && childProcess1) {
          processManager.register(managed1, childProcess1);
        }

        const managed2 = launcher.getProcess(pid2);
        const childProcess2 = launcher.getChildProcess(pid2);
        if (managed2 && childProcess2) {
          processManager.register(managed2, childProcess2);
        }

        // Create pipeline
        const groupId = processManager.createPipeline("test-pipeline", [
          pid1,
          pid2,
        ]);

        // Verify group was created
        const group = processManager.getGroup(groupId);
        expect(group?.pipeline).toBe(true);
        expect(group?.processes).toContain(pid1);
        expect(group?.processes).toContain(pid2);

        // Wait for processes to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
      } finally {
        // Clean up
        try {
          process.kill(pid1, "SIGKILL");
        } catch (e) {
          // May already be dead
        }
        try {
          process.kill(pid2, "SIGKILL");
        } catch (e) {
          // May already be dead
        }
      }
    });
  });
});
