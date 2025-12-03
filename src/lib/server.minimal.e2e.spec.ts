import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";

/**
 * Detect if running in CI environment
 * Checks common CI environment variables
 */
function isCI(): boolean {
  return !!(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.JENKINS_URL ||
    process.env.BUILDKITE
  );
}

/**
 * Adjust timeout for CI environments
 * Increases timeout by 50% when running in CI
 */
function adjustTimeout(timeoutMs: number): number {
  if (isCI()) {
    const adjusted = Math.floor(timeoutMs * 1.5);
    console.log(`[CI] Adjusting timeout from ${timeoutMs}ms to ${adjusted}ms`);
    return adjusted;
  }
  return timeoutMs;
}

/**
 * Enable diagnostic logging for debugging
 * Set to true to log all requests and responses
 */
const ENABLE_DIAGNOSTICS = process.env.DEBUG_E2E === "true" || isCI();

/**
 * Log diagnostic information for debugging
 */
function logDiagnostic(category: string, message: string, data?: any): void {
  if (ENABLE_DIAGNOSTICS) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${category}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

/**
 * Minimal End-to-End Smoke Tests for MCP Process Server
 * Quick validation of basic functionality (< 30 seconds)
 * Requirements: 12.1, 12.2, 12.3
 */
describe("MCP Process Server - Minimal E2E", () => {
  let serverProcess: ChildProcess | null = null;
  let messageId = 0;

  /**
   * Find the CLI file for the MCP server
   * Provides file system diagnostics for debugging
   */
  function findCliFile(): string | null {
    const possiblePaths = [
      path.join(__dirname, "../../dist/cli.js"),
      path.join(__dirname, "../dist/cli.js"),
      path.join(process.cwd(), "dist/cli.js"),
    ];

    logDiagnostic("FILE_SEARCH", "Searching for CLI file in possible paths", {
      possiblePaths,
      __dirname,
      cwd: process.cwd(),
    });

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        logDiagnostic("FILE_SEARCH", `Found CLI file at: ${p}`);
        return p;
      }
    }

    // Recursive search
    const searchDirs = [
      process.cwd(),
      path.dirname(process.cwd()),
      path.dirname(path.dirname(process.cwd())),
    ];

    logDiagnostic(
      "FILE_SEARCH",
      "Starting recursive search in directories",
      searchDirs
    );

    for (const dir of searchDirs) {
      const found = searchForCli(dir);
      if (found) {
        logDiagnostic(
          "FILE_SEARCH",
          `Found CLI file via recursive search: ${found}`
        );
        return found;
      }
    }

    // Provide diagnostic information about what was searched
    logDiagnostic("FILE_SEARCH", "CLI file not found. Searched paths:", {
      possiblePaths,
      searchDirs,
      __dirname,
      cwd: process.cwd(),
    });

    return null;
  }

  /**
   * Recursively search for CLI file
   */
  function searchForCli(dir: string, maxDepth: number = 3): string | null {
    if (maxDepth <= 0) return null;

    const cliPath = path.join(dir, "dist/cli.js");
    if (fs.existsSync(cliPath)) {
      try {
        const packagePath = path.join(dir, "package.json");
        if (fs.existsSync(packagePath)) {
          const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
          if (pkg.name === "@ai-capabilities-suite/mcp-process") {
            return cliPath;
          }
        }
      } catch (e) {
        return cliPath;
      }
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
        ) {
          const found = searchForCli(path.join(dir, entry.name), maxDepth - 1);
          if (found) return found;
        }
      }
    } catch (e) {
      // Ignore permission errors
    }

    return null;
  }

  /**
   * Start the MCP server process
   */
  async function startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const serverPath = findCliFile();
      if (!serverPath) {
        reject(
          new Error(
            "Server CLI not found. Please build the server first with: npm run build"
          )
        );
        return;
      }

      console.log(`[Minimal E2E] Starting server from: ${serverPath}`);

      serverProcess = spawn("node", [serverPath], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!serverProcess || !serverProcess.stdout || !serverProcess.stdin) {
        reject(new Error("Failed to start server process"));
        return;
      }

      serverProcess.stdout.setMaxListeners(50);
      serverProcess.stderr?.setMaxListeners(50);
      serverProcess.stdin.setMaxListeners(50);

      serverProcess.stderr?.on("data", (data) => {
        // Suppress stderr for cleaner output
        // console.error(`[Minimal E2E] stderr:`, data.toString());
      });

      serverProcess.on("error", (error) => {
        console.error(`[Minimal E2E] error:`, error);
        reject(error);
      });

      // Wait for server to be ready (adjusted for CI)
      const initTimeout = adjustTimeout(2000);
      setTimeout(() => resolve(), initTimeout);
    });
  }

  /**
   * Send a JSON-RPC request to the server
   * Adjusts timeouts for CI environments
   */
  async function sendRequest(
    method: string,
    params?: any,
    timeoutMs: number = 10000
  ): Promise<any> {
    if (!serverProcess) {
      throw new Error("Server not started");
    }

    // Adjust timeout for CI environments (50% increase)
    const adjustedTimeout = adjustTimeout(timeoutMs);

    return new Promise((resolve, reject) => {
      const id = ++messageId;
      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params: params || {},
      };

      // Log request for diagnostics
      logDiagnostic("REQUEST", `Sending ${method} (ID: ${id})`, request);

      let responseData = "";
      let stderrData = "";

      // Capture stderr for diagnostics
      const onStderr = (data: Buffer) => {
        stderrData += data.toString();
      };
      serverProcess!.stderr?.on("data", onStderr);

      const timeout = setTimeout(() => {
        serverProcess!.stderr?.removeListener("data", onStderr);

        // Log diagnostic information on timeout
        logDiagnostic(
          "TIMEOUT",
          `Request timeout for ${method} (ID: ${id}) after ${adjustedTimeout}ms`,
          {
            request,
            partialResponse: responseData,
            stderr: stderrData,
          }
        );

        reject(
          new Error(
            `Request timeout for ${method} after ${adjustedTimeout}ms. Stderr: ${stderrData}`
          )
        );
      }, adjustedTimeout);

      const onData = (data: Buffer) => {
        const chunk = data.toString();
        responseData += chunk;

        // Try to parse complete JSON-RPC messages
        const lines = responseData.split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === id) {
                clearTimeout(timeout);
                serverProcess!.stdout?.removeListener("data", onData);
                serverProcess!.stderr?.removeListener("data", onStderr);

                // Log response for diagnostics
                logDiagnostic(
                  "RESPONSE",
                  `Received response for ${method} (ID: ${id})`,
                  response
                );

                if (response.error) {
                  // Log error response with stderr
                  logDiagnostic(
                    "ERROR",
                    `Error response for ${method} (ID: ${id})`,
                    {
                      error: response.error,
                      stderr: stderrData,
                    }
                  );
                  reject(new Error(response.error.message));
                } else {
                  resolve(response.result);
                }
                return;
              }
            } catch (e) {
              // Not a complete JSON message yet, continue
            }
          }
        }
      };

      serverProcess!.stdout?.on("data", onData);
      serverProcess!.stdin?.write(JSON.stringify(request) + "\n");
    });
  }

  /**
   * Stop the server process
   * Ensures all spawned processes are terminated, event listeners removed, and resources cleaned up
   */
  function stopServer(): void {
    if (serverProcess && !serverProcess.killed) {
      console.log("[Minimal E2E] Stopping server process...");

      // Remove all event listeners to prevent memory leaks
      if (serverProcess.stdout) {
        serverProcess.stdout.removeAllListeners();
        serverProcess.stdout.destroy();
      }
      if (serverProcess.stderr) {
        serverProcess.stderr.removeAllListeners();
        serverProcess.stderr.destroy();
      }
      if (serverProcess.stdin) {
        serverProcess.stdin.removeAllListeners();
        serverProcess.stdin.destroy();
      }

      // Remove all process event listeners
      serverProcess.removeAllListeners();

      // Kill the process gracefully first
      serverProcess.kill("SIGTERM");

      // Give it a moment to shut down gracefully
      const killTimeout = setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          console.log("[Minimal E2E] Force killing server process");
          serverProcess.kill("SIGKILL");
        }
      }, 1000);

      // Clear the timeout if process exits
      serverProcess.once("exit", () => {
        clearTimeout(killTimeout);
      });

      serverProcess = null;
      console.log("[Minimal E2E] Server process stopped");
    }
  }

  /**
   * Helper to safely parse response text
   */
  function safeParseResponse(text: string): any {
    try {
      return JSON.parse(text);
    } catch (e) {
      // Handle plain text errors
      if (text.includes("MCP error")) {
        return {
          status: "error",
          error: {
            code: "PARSE_ERROR",
            message: text,
          },
        };
      }
      throw e;
    }
  }

  beforeAll(async () => {
    console.log(
      `[Minimal E2E] Running in ${isCI() ? "CI" : "local"} environment`
    );
    await startServer();
  }, adjustTimeout(30000)); // Adjusted for CI environments

  afterAll(() => {
    console.log("[Minimal E2E] Starting afterAll cleanup...");
    stopServer();
    console.log("[Minimal E2E] afterAll cleanup complete");
  });

  /**
   * Minimal test for initialize
   * Requirements: 12.1, 12.2, 12.3
   */
  it("should respond to initialize request", async () => {
    // Send initialize request
    const result = await sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "minimal-test-client",
        version: "1.0.0",
      },
    });

    // Verify response is valid (Requirement 12.3)
    expect(result).toBeDefined();
    expect(result.protocolVersion).toBe("2024-11-05");
    expect(result.serverInfo).toBeDefined();
    expect(result.serverInfo.name).toBe("mcp-process");
    expect(result.capabilities).toBeDefined();
  }, 10000);

  /**
   * Minimal test for tools/list
   * Requirements: 12.1, 12.2, 12.3
   */
  it("should respond to tools/list request", async () => {
    // Send tools/list request
    const result = await sendRequest("tools/list");

    // Verify response contains tools array (Requirement 12.2, 12.3)
    expect(result).toBeDefined();
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBeGreaterThan(0);

    // Verify basic tools are present
    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain("process_start");
    expect(toolNames).toContain("process_list");
  }, 10000);

  /**
   * Minimal test for basic process launch
   * Requirements: 12.1, 12.2, 12.3
   */
  it("should launch a basic process successfully", async () => {
    // Send tools/call request for process_start
    const result = await sendRequest("tools/call", {
      name: "process_start",
      arguments: {
        executable: "node",
        args: ["--version"],
        captureOutput: true,
      },
    });

    // Verify process starts successfully (Requirement 12.2, 12.3)
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);

    const textContent = result.content.find((c: any) => c.type === "text");
    expect(textContent).toBeDefined();

    const response = safeParseResponse(textContent.text);

    // Verify success status and valid PID
    expect(response.status).toBe("success");
    expect(response.pid).toBeDefined();
    expect(response.pid).toBeGreaterThan(0);

    // Wait for process to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }, 15000);
});
