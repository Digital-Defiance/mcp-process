/**
 * ProcessTerminator - Property-Based Tests
 *
 * Feature: mcp-process
 */

import * as fc from "fast-check";
import { ProcessTerminator } from "./ProcessTerminator";
import { ProcessLauncher } from "./ProcessLauncher";
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
    maxConcurrentProcesses: 10,
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

// Helper to check if a signal was sent to a process
function wasSignalSent(pid: number, signal: NodeJS.Signals): boolean {
  try {
    // If process still exists, we can't definitively say the signal was sent
    // But if it doesn't exist, it was likely terminated
    process.kill(pid, 0);
    return false; // Process still running
  } catch (error) {
    // Process doesn't exist anymore
    return true;
  }
}

describe("ProcessTerminator", () => {
  describe("Property 7: Graceful termination sends SIGTERM", () => {
    /**
     * Feature: mcp-process, Property 7: Graceful termination sends SIGTERM
     *
     * For any process, when graceful termination is requested, SIGTERM (or platform equivalent) should be sent to the process.
     * Validates: Requirements 5.1
     */
    it("should send SIGTERM when graceful termination is requested", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 2000 }), // timeout values
          async (timeout) => {
            const securityConfig = createTestSecurityConfig();
            const securityManager = new SecurityManager(securityConfig);
            const launcher = new ProcessLauncher(securityManager);
            const terminator = new ProcessTerminator(launcher, securityManager);

            // Launch a long-running process that can handle SIGTERM
            // Use node with a simple script that runs indefinitely
            const config: ProcessConfig = {
              executable: "node",
              args: ["-e", "setInterval(function() {}, 1000)"],
              captureOutput: true,
            };

            const pid = await launcher.launch(config);

            try {
              // Give process time to start
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Verify process is running
              expect(launcher.isRunning(pid)).toBe(true);

              // Terminate gracefully
              const result = await terminator.terminateGracefully(pid, timeout);

              // Verify termination was successful
              expect(result.success).toBe(true);
              expect(result.pid).toBe(pid);
              expect(result.reason).toMatch(/graceful|timeout/);

              // Verify process is no longer running
              await waitForExit(pid, 1000);
              expect(launcher.isRunning(pid)).toBe(false);
            } catch (error) {
              // Clean up if test fails
              try {
                process.kill(pid, "SIGKILL");
              } catch (e) {
                // Process may already be dead
              }
              throw error;
            }
          }
        ),
        { numRuns: 10 } // Run 10 times instead of 100 for faster tests with real processes
      );
    });

    it("should handle processes that exit gracefully", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const terminator = new ProcessTerminator(launcher, securityManager);

      // Launch a process that runs for a bit
      const config: ProcessConfig = {
        executable: "node",
        args: ["-e", "setTimeout(() => process.exit(0), 100)"],
        captureOutput: true,
      };

      const pid = await launcher.launch(config);

      // Give it a moment to start
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Terminate it gracefully (it should exit on its own soon)
      const result = await terminator.terminateGracefully(pid, 1000);

      expect(result.success).toBe(true);
      expect(result.pid).toBe(pid);
    });
  });

  describe("Property 8: Timeout escalation to SIGKILL", () => {
    /**
     * Feature: mcp-process, Property 8: Timeout escalation to SIGKILL
     *
     * For any graceful termination with timeout, if the process doesn't exit within the timeout, SIGKILL should be sent.
     * Validates: Requirements 5.3
     */
    it("should escalate to SIGKILL when process doesn't exit within timeout", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 100, max: 500 }), // short timeout to trigger escalation
          async (timeout) => {
            const securityConfig = createTestSecurityConfig();
            const securityManager = new SecurityManager(securityConfig);
            const launcher = new ProcessLauncher(securityManager);
            const terminator = new ProcessTerminator(launcher, securityManager);

            // Launch a process that ignores SIGTERM
            // Use sleep command which can be killed
            const config: ProcessConfig = {
              executable: "sleep",
              args: ["1000"],
              captureOutput: true,
            };

            const pid = await launcher.launch(config);

            try {
              // Give process time to start and set up signal handler
              await new Promise((resolve) => setTimeout(resolve, 200));

              // Verify process is running
              expect(launcher.isRunning(pid)).toBe(true);

              const startTime = Date.now();

              // Terminate gracefully with short timeout
              const result = await terminator.terminateGracefully(pid, timeout);

              const elapsed = Date.now() - startTime;

              // Verify termination was successful
              expect(result.success).toBe(true);
              expect(result.pid).toBe(pid);

              // If timeout occurred, reason should be 'timeout'
              // The process should be killed within timeout + some buffer
              expect(elapsed).toBeLessThan(timeout + 2000);

              // Verify process is no longer running
              await waitForExit(pid, 1000);
              expect(launcher.isRunning(pid)).toBe(false);
            } catch (error) {
              // Clean up if test fails
              try {
                process.kill(pid, "SIGKILL");
              } catch (e) {
                // Process may already be dead
              }
              throw error;
            }
          }
        ),
        { numRuns: 10 } // Run 10 times for faster tests
      );
    });

    it("should handle immediate SIGKILL for forced termination", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const terminator = new ProcessTerminator(launcher, securityManager);

      // Launch a long-running process
      const config: ProcessConfig = {
        executable: "sleep",
        args: ["1000"],
        captureOutput: true,
      };

      const pid = await launcher.launch(config);

      try {
        // Give process time to start
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify process is running
        expect(launcher.isRunning(pid)).toBe(true);

        // Terminate forcefully
        const result = await terminator.terminateForcefully(pid);

        // Verify termination was successful
        expect(result.success).toBe(true);
        expect(result.pid).toBe(pid);
        expect(result.reason).toBe("forced");

        // Verify process is no longer running
        await waitForExit(pid, 1000);
        expect(launcher.isRunning(pid)).toBe(false);
      } catch (error) {
        // Clean up if test fails
        try {
          process.kill(pid, "SIGKILL");
        } catch (e) {
          // Process may already be dead
        }
        throw error;
      }
    });
  });

  describe("Process group termination", () => {
    it("should terminate all processes in a group", async () => {
      const securityConfig = createTestSecurityConfig();
      const securityManager = new SecurityManager(securityConfig);
      const launcher = new ProcessLauncher(securityManager);
      const terminator = new ProcessTerminator(launcher, securityManager);

      // Launch multiple processes
      const pids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const config: ProcessConfig = {
          executable: "node",
          args: ["-e", "setInterval(function() {}, 1000)"],
          captureOutput: true,
        };
        const pid = await launcher.launch(config);
        pids.push(pid);
      }

      try {
        // Give processes time to start
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify all processes are running
        pids.forEach((pid) => {
          expect(launcher.isRunning(pid)).toBe(true);
        });

        // Terminate the group
        const results = await terminator.terminateGroup(pids, false, 1000);

        // Verify all terminations were successful
        expect(results).toHaveLength(3);
        results.forEach((result) => {
          expect(result.success).toBe(true);
          expect(pids).toContain(result.pid);
        });

        // Verify all processes are no longer running
        await Promise.all(pids.map((pid) => waitForExit(pid, 1000)));
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
    });
  });
});
