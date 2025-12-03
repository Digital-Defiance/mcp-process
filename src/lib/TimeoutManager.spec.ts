/**
 * TimeoutManager tests
 * Tests timeout management functionality including property-based tests
 */

import { TimeoutManager } from "./TimeoutManager";
import { ProcessError } from "../types";
import * as fc from "fast-check";

describe("TimeoutManager", () => {
  let timeoutManager: TimeoutManager;

  beforeEach(() => {
    timeoutManager = new TimeoutManager(5000); // 5 second default
  });

  afterEach(() => {
    timeoutManager.clearAll();
  });

  describe("Basic functionality", () => {
    it("should register a timeout", () => {
      const pid = 1234;
      const timeoutMs = 1000;
      let timeoutTriggered = false;

      timeoutManager.registerTimeout(pid, timeoutMs, () => {
        timeoutTriggered = true;
      });

      const info = timeoutManager.getTimeoutInfo(pid);
      expect(info).toBeDefined();
      expect(info?.pid).toBe(pid);
      expect(info?.timeoutMs).toBe(timeoutMs);
      expect(info?.triggered).toBe(false);
    });

    it("should use default timeout when 0 is specified", () => {
      const pid = 1234;

      timeoutManager.registerTimeout(pid, 0, () => {});

      const info = timeoutManager.getTimeoutInfo(pid);
      expect(info?.timeoutMs).toBe(5000); // default
    });

    it("should trigger timeout callback", (done) => {
      const pid = 1234;
      const timeoutMs = 100;

      timeoutManager.registerTimeout(pid, timeoutMs, (callbackPid) => {
        expect(callbackPid).toBe(pid);
        const info = timeoutManager.getTimeoutInfo(pid);
        expect(info?.triggered).toBe(true);
        done();
      });
    });

    it("should clear timeout", (done) => {
      const pid = 1234;
      let timeoutTriggered = false;

      timeoutManager.registerTimeout(pid, 100, () => {
        timeoutTriggered = true;
      });

      timeoutManager.clearTimeout(pid);

      // Immediately check that timeout info is cleared
      expect(timeoutManager.getTimeoutInfo(pid)).toBeUndefined();

      // Wait to ensure timeout doesn't trigger
      setTimeout(() => {
        expect(timeoutTriggered).toBe(false);
        done();
      }, 200);
    });

    it("should calculate remaining time", () => {
      const pid = 1234;
      const timeoutMs = 5000;

      timeoutManager.registerTimeout(pid, timeoutMs, () => {});

      const remaining = timeoutManager.getRemainingTime(pid);
      expect(remaining).toBeDefined();
      expect(remaining).toBeGreaterThan(4900);
      expect(remaining).toBeLessThanOrEqual(5000);
    });

    it("should detect exceeded timeout", (done) => {
      const pid = 1234;
      const timeoutMs = 100;

      timeoutManager.registerTimeout(pid, timeoutMs, () => {
        expect(timeoutManager.hasExceededTimeout(pid)).toBe(true);
        done();
      });
    });

    it("should extend timeout", (done) => {
      const pid = 1234;
      const initialTimeout = 200;
      const extension = 300;
      let timeoutTriggered = false;

      timeoutManager.registerTimeout(pid, initialTimeout, () => {
        timeoutTriggered = true;
      });

      // Extend after 100ms
      setTimeout(() => {
        timeoutManager.extendTimeout(pid, extension);

        // Check that timeout hasn't triggered yet after original timeout
        setTimeout(() => {
          expect(timeoutTriggered).toBe(false);

          // Wait for extended timeout
          setTimeout(() => {
            expect(timeoutTriggered).toBe(true);
            done();
          }, 250);
        }, 150);
      }, 100);
    });

    it("should throw error when extending non-existent timeout", () => {
      expect(() => {
        timeoutManager.extendTimeout(9999, 1000);
      }).toThrow(ProcessError);
    });

    it("should throw error when extending already triggered timeout", (done) => {
      const pid = 1234;

      timeoutManager.registerTimeout(pid, 50, () => {
        setTimeout(() => {
          expect(() => {
            timeoutManager.extendTimeout(pid, 1000);
          }).toThrow(ProcessError);
          done();
        }, 10);
      });
    });

    it("should clear all timeouts", () => {
      timeoutManager.registerTimeout(1, 1000, () => {});
      timeoutManager.registerTimeout(2, 1000, () => {});
      timeoutManager.registerTimeout(3, 1000, () => {});

      expect(timeoutManager.getTimeoutInfo(1)).toBeDefined();
      expect(timeoutManager.getTimeoutInfo(2)).toBeDefined();
      expect(timeoutManager.getTimeoutInfo(3)).toBeDefined();

      timeoutManager.clearAll();

      expect(timeoutManager.getTimeoutInfo(1)).toBeUndefined();
      expect(timeoutManager.getTimeoutInfo(2)).toBeUndefined();
      expect(timeoutManager.getTimeoutInfo(3)).toBeUndefined();
    });

    it("should get and set default timeout", () => {
      expect(timeoutManager.getDefaultTimeout()).toBe(5000);

      timeoutManager.setDefaultTimeout(10000);
      expect(timeoutManager.getDefaultTimeout()).toBe(10000);
    });

    it("should throw error when setting invalid default timeout", () => {
      expect(() => {
        timeoutManager.setDefaultTimeout(0);
      }).toThrow(ProcessError);

      expect(() => {
        timeoutManager.setDefaultTimeout(-1000);
      }).toThrow(ProcessError);
    });
  });

  describe("Property-based tests", () => {
    /**
     * Feature: mcp-process, Property 13: Timeout enforcement
     * Validates: Requirements 9.1
     *
     * For any process with a timeout, when the timeout is exceeded,
     * the process should be terminated.
     */
    it("Property 13: Timeout enforcement - any process with timeout should trigger callback when exceeded", () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }), // pid
          fc.integer({ min: 50, max: 500 }), // timeout in ms
          async (pid, timeoutMs) => {
            const manager = new TimeoutManager();
            let callbackTriggered = false;
            let callbackPid: number | undefined;

            // Register timeout
            manager.registerTimeout(pid, timeoutMs, (triggeredPid) => {
              callbackTriggered = true;
              callbackPid = triggeredPid;
            });

            // Wait for timeout to trigger (with some buffer)
            await new Promise((resolve) =>
              setTimeout(resolve, timeoutMs + 100)
            );

            // Verify timeout was triggered
            expect(callbackTriggered).toBe(true);
            expect(callbackPid).toBe(pid);

            // Verify timeout info shows triggered
            const info = manager.getTimeoutInfo(pid);
            expect(info?.triggered).toBe(true);

            // Verify hasExceededTimeout returns true
            expect(manager.hasExceededTimeout(pid)).toBe(true);

            // Cleanup
            manager.clearAll();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property: Remaining time decreases monotonically", () => {
      return fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }), // pid
          fc.integer({ min: 1000, max: 5000 }), // timeout in ms
          (pid, timeoutMs) => {
            const manager = new TimeoutManager();

            manager.registerTimeout(pid, timeoutMs, () => {});

            const remaining1 = manager.getRemainingTime(pid);
            expect(remaining1).toBeDefined();

            // Small delay
            const start = Date.now();
            while (Date.now() - start < 10) {
              // busy wait
            }

            const remaining2 = manager.getRemainingTime(pid);
            expect(remaining2).toBeDefined();

            // Remaining time should decrease
            expect(remaining2!).toBeLessThanOrEqual(remaining1!);

            manager.clearAll();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property: Extending timeout increases remaining time", () => {
      return fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }), // pid
          fc.integer({ min: 1000, max: 5000 }), // initial timeout
          fc.integer({ min: 500, max: 2000 }), // extension
          (pid, initialTimeout, extension) => {
            const manager = new TimeoutManager();

            manager.registerTimeout(pid, initialTimeout, () => {});

            const remainingBefore = manager.getRemainingTime(pid);
            expect(remainingBefore).toBeDefined();

            manager.extendTimeout(pid, extension);

            const remainingAfter = manager.getRemainingTime(pid);
            expect(remainingAfter).toBeDefined();

            // Remaining time should increase by approximately the extension
            // (allowing for small timing variations)
            expect(remainingAfter!).toBeGreaterThan(remainingBefore!);
            expect(remainingAfter! - remainingBefore!).toBeGreaterThan(
              extension - 100
            );

            manager.clearAll();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property: Clearing timeout prevents callback execution", () => {
      return fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 100000 }), // pid
          fc.integer({ min: 50, max: 200 }), // timeout in ms
          async (pid, timeoutMs) => {
            const manager = new TimeoutManager();
            let callbackTriggered = false;

            manager.registerTimeout(pid, timeoutMs, () => {
              callbackTriggered = true;
            });

            // Clear immediately
            manager.clearTimeout(pid);

            // Wait longer than timeout
            await new Promise((resolve) =>
              setTimeout(resolve, timeoutMs + 100)
            );

            // Callback should not have been triggered
            expect(callbackTriggered).toBe(false);

            // Timeout info should be gone
            expect(manager.getTimeoutInfo(pid)).toBeUndefined();

            manager.clearAll();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property: Default timeout is used when timeout is 0", () => {
      return fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }), // pid
          fc.integer({ min: 1000, max: 10000 }), // default timeout
          (pid, defaultTimeout) => {
            const manager = new TimeoutManager(defaultTimeout);

            manager.registerTimeout(pid, 0, () => {});

            const info = manager.getTimeoutInfo(pid);
            expect(info?.timeoutMs).toBe(defaultTimeout);

            manager.clearAll();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
