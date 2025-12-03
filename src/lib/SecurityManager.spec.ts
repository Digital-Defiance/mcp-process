/**
 * SecurityManager - Property-Based Tests
 *
 * Feature: mcp-process
 */

import * as fc from "fast-check";
import { SecurityManager } from "./SecurityManager";
import { SecurityConfig, SecurityError } from "../types";

describe("SecurityManager", () => {
  describe("Property 2: Allowlist enforcement on launch", () => {
    /**
     * Feature: mcp-process, Property 2: Allowlist enforcement on launch
     *
     * For any executable not in the allowlist, launch attempts should be rejected with a security error.
     * Validates: Requirements 1.4, 11.2, 14.2
     */
    it("should reject executables not in allowlist", () => {
      fc.assert(
        fc.property(
          // Generate arbitrary executable names that are NOT in our allowlist
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter(
              (name) =>
                !name.includes("/") &&
                !name.includes("\\") &&
                name !== "node" &&
                name !== "echo" &&
                name.trim().length > 0
            ),
          fc.array(fc.string(), { maxLength: 5 }),
          (executable, args) => {
            const config: SecurityConfig = {
              allowedExecutables: ["node", "echo"], // Limited allowlist
              defaultResourceLimits: {
                maxCpuPercent: 80,
                maxMemoryMB: 1024,
              },
              maxConcurrentProcesses: 10,
              maxProcessLifetime: 3600,
              enableAuditLog: false,
              requireConfirmation: false,
              blockSetuidExecutables: true,
              blockShellInterpreters: true,
            };

            const securityManager = new SecurityManager(config);

            // Executable not in allowlist should throw SecurityError
            expect(() => {
              securityManager.validateExecutable(executable, args);
            }).toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should accept executables in allowlist", () => {
      fc.assert(
        fc.property(
          fc.constantFrom("node", "echo"),
          fc.array(
            fc
              .string()
              .filter(
                (s) =>
                  !s.includes("$(") &&
                  !s.includes("`") &&
                  !s.includes("|") &&
                  !s.includes(";") &&
                  !s.includes("&") &&
                  !s.includes("\n") &&
                  !s.includes("../") &&
                  !s.includes("..\\")
              ),
            { maxLength: 5 }
          ),
          (executable, args) => {
            const config: SecurityConfig = {
              allowedExecutables: ["node", "echo"],
              defaultResourceLimits: {
                maxCpuPercent: 80,
                maxMemoryMB: 1024,
              },
              maxConcurrentProcesses: 10,
              maxProcessLifetime: 3600,
              enableAuditLog: false,
              requireConfirmation: false,
              blockSetuidExecutables: true,
              blockShellInterpreters: true,
            };

            const securityManager = new SecurityManager(config);

            // Executable in allowlist should not throw (or throw non-SecurityError if not found)
            try {
              securityManager.validateExecutable(executable, args);
              // If it doesn't throw, that's fine - executable was found and validated
            } catch (error) {
              // If it throws, it should be because executable wasn't found, not because of allowlist
              if (error instanceof SecurityError) {
                expect(error.message).not.toContain("not in allowlist");
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Property 15: Environment variable sanitization", () => {
    /**
     * Feature: mcp-process, Property 15: Environment variable sanitization
     *
     * For any process launch with environment variables, dangerous variables (LD_PRELOAD, etc.) should be removed or rejected.
     * Validates: Requirements 11.4
     */
    it("should remove dangerous environment variables", () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            "LD_PRELOAD",
            "LD_LIBRARY_PATH",
            "DYLD_INSERT_LIBRARIES",
            "DYLD_LIBRARY_PATH",
            "PATH",
            "PYTHONPATH",
            "NODE_PATH",
            "PERL5LIB",
            "RUBYLIB",
            "Path",
            "PATHEXT",
            "COMSPEC"
          ),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.record({
            SAFE_VAR1: fc
              .string({ maxLength: 100 })
              .filter(
                (s) =>
                  !s.includes("$(") &&
                  !s.includes("`") &&
                  !s.includes("\n") &&
                  s.length <= 4096
              ),
            SAFE_VAR2: fc
              .string({ maxLength: 100 })
              .filter(
                (s) =>
                  !s.includes("$(") &&
                  !s.includes("`") &&
                  !s.includes("\n") &&
                  s.length <= 4096
              ),
          }),
          (dangerousVar, dangerousValue, safeVars) => {
            const config: SecurityConfig = {
              allowedExecutables: ["node"],
              defaultResourceLimits: {
                maxCpuPercent: 80,
                maxMemoryMB: 1024,
              },
              maxConcurrentProcesses: 10,
              maxProcessLifetime: 3600,
              enableAuditLog: false,
              requireConfirmation: false,
              blockSetuidExecutables: true,
              blockShellInterpreters: true,
            };

            const securityManager = new SecurityManager(config);

            const env = {
              ...safeVars,
              [dangerousVar]: dangerousValue,
            };

            try {
              const sanitized = securityManager.sanitizeEnvironment(env);

              // Dangerous variable should be removed
              expect(sanitized[dangerousVar]).toBeUndefined();

              // Safe variables should remain
              expect(sanitized.SAFE_VAR1).toBe(safeVars.SAFE_VAR1);
              expect(sanitized.SAFE_VAR2).toBe(safeVars.SAFE_VAR2);
            } catch (error) {
              // If it throws, it should be due to injection detection, not just presence
              if (error instanceof SecurityError) {
                expect(error.message).toMatch(
                  /injection|too long|size exceeds/i
                );
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject environment variables with command injection patterns", () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter(
              (s) =>
                s !== "LD_PRELOAD" &&
                s !== "PATH" &&
                s !== "PYTHONPATH" &&
                !s.includes("$") &&
                !s.includes("`")
            ),
          fc.constantFrom("$(whoami)", "`ls`", "test\nmalicious"),
          (varName, maliciousValue) => {
            const config: SecurityConfig = {
              allowedExecutables: ["node"],
              defaultResourceLimits: {
                maxCpuPercent: 80,
                maxMemoryMB: 1024,
              },
              maxConcurrentProcesses: 10,
              maxProcessLifetime: 3600,
              enableAuditLog: false,
              requireConfirmation: false,
              blockSetuidExecutables: true,
              blockShellInterpreters: true,
            };

            const securityManager = new SecurityManager(config);

            const env = {
              [varName]: maliciousValue,
            };

            // Should throw SecurityError for injection patterns
            expect(() => {
              securityManager.sanitizeEnvironment(env);
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("should reject excessively large environment variables", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.string({ minLength: 4097, maxLength: 5000 }), // Exceeds 4096 limit
          (varName, largeValue) => {
            const config: SecurityConfig = {
              allowedExecutables: ["node"],
              defaultResourceLimits: {
                maxCpuPercent: 80,
                maxMemoryMB: 1024,
              },
              maxConcurrentProcesses: 10,
              maxProcessLifetime: 3600,
              enableAuditLog: false,
              requireConfirmation: false,
              blockSetuidExecutables: true,
              blockShellInterpreters: true,
            };

            const securityManager = new SecurityManager(config);

            const env = {
              [varName]: largeValue,
            };

            // Should throw SecurityError for oversized values
            expect(() => {
              securityManager.sanitizeEnvironment(env);
            }).toThrow(SecurityError);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
