/**
 * MCP Server - Main server implementation
 *
 * Initializes and manages the MCP Process Server with stdio transport.
 * Handles server lifecycle, tool registration, and graceful shutdown.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPTools } from "./MCPTools";
import { ProcessLauncher } from "./ProcessLauncher";
import { ProcessManager } from "./ProcessManager";
import { ProcessTerminator } from "./ProcessTerminator";
import { ResourceMonitor } from "./ResourceMonitor";
import { IOManager } from "./IOManager";
import { ServiceManager } from "./ServiceManager";
import { SecurityManager } from "./SecurityManager";
import { TimeoutManager } from "./TimeoutManager";
import { ConfigLoader } from "./ConfigLoader";
import { ErrorHandler } from "./ErrorHandler";
import { SecurityConfig } from "../types";

/**
 * MCP Process Server
 * Main server class that orchestrates all components
 */
export class MCPServer {
  private server: Server;
  private transport: StdioServerTransport;
  private mcpTools: MCPTools;
  private processManager: ProcessManager;
  private securityManager: SecurityManager;
  private config: SecurityConfig;
  private isRunning: boolean = false;

  constructor(config?: SecurityConfig) {
    // Load configuration (from file, env, or use provided config)
    if (config) {
      console.error("[MCP Server] Using provided configuration");
      this.config = config;
    } else {
      console.error("[MCP Server] Loading configuration...");
      this.config = ConfigLoader.load();
    }

    // Initialize security manager first (validates config)
    this.securityManager = new SecurityManager(this.config);

    // Initialize timeout manager before process launcher
    const timeoutManager = new TimeoutManager(
      this.config.maxProcessLifetime * 1000
    );

    // Initialize all components
    const processLauncher = new ProcessLauncher(
      this.securityManager,
      timeoutManager
    );
    this.processManager = new ProcessManager();
    const processTerminator = new ProcessTerminator(
      processLauncher,
      this.securityManager,
      this.processManager
    );
    const resourceMonitor = new ResourceMonitor();
    const ioManager = new IOManager(
      this.processManager.getChildProcesses(),
      this.processManager.getProcesses()
    );
    const serviceManager = new ServiceManager(
      processLauncher,
      this.securityManager
    );

    // Initialize MCP tools
    this.mcpTools = new MCPTools(
      processLauncher,
      this.processManager,
      processTerminator,
      resourceMonitor,
      ioManager,
      serviceManager,
      this.securityManager,
      timeoutManager
    );

    // Create MCP server instance
    this.server = new Server(
      {
        name: "mcp-process",
        version: "0.0.1",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Create stdio transport
    this.transport = new StdioServerTransport();

    // Set up error handlers
    this.server.onerror = (error) => {
      console.error("[MCP Server Error]", error);
    };

    // Set up process signal handlers for graceful shutdown
    process.on("SIGINT", () => {
      console.error("[MCP Server] Received SIGINT, shutting down...");
      this.shutdown();
    });
    process.on("SIGTERM", () => {
      console.error("[MCP Server] Received SIGTERM, shutting down...");
      this.shutdown();
    });
    process.on("uncaughtException", (error) => {
      console.error("[MCP Server] Uncaught exception:", error);
      this.shutdown();
    });
    process.on("unhandledRejection", (reason, promise) => {
      console.error(
        "[MCP Server] Unhandled rejection at:",
        promise,
        "reason:",
        reason
      );
      this.shutdown();
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Server is already running");
    }

    console.error("[MCP Server] Starting MCP Process Server v0.0.1");
    console.error("[MCP Server] Initializing with security configuration...");

    try {
      // Register handlers
      this.registerHandlers();
      console.error("[MCP Server] Registered 12 MCP tools");

      // Connect transport
      await this.server.connect(this.transport);
      console.error("[MCP Server] Connected stdio transport");

      this.isRunning = true;
      console.error(
        "[MCP Server] Server started successfully and ready to accept requests"
      );
    } catch (error) {
      console.error("[MCP Server] Failed to start server:", error);
      throw error;
    }
  }

  /**
   * Register MCP protocol handlers
   */
  private registerHandlers(): void {
    // Register list_tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const schemas = MCPTools.getAllSchemas();
      return {
        tools: schemas.map((schema) => {
          // Convert Zod schema to JSON Schema
          const shape = (schema.inputSchema as any).shape || {};
          const properties: Record<string, any> = {};
          const required: string[] = [];

          for (const [key, value] of Object.entries(shape)) {
            properties[key] = { type: "string" }; // Simplified - Zod will validate
            if (!(value as any).isOptional()) {
              required.push(key);
            }
          }

          return {
            name: schema.name,
            description: schema.description,
            inputSchema: {
              type: "object" as const,
              properties,
              required,
            },
          };
        }),
      };
    });

    // Register call_tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case "process_start":
            result = await this.mcpTools.processStart(args as any);
            break;

          case "process_terminate":
            result = await this.mcpTools.processTerminate(args as any);
            break;

          case "process_get_stats":
            result = await this.mcpTools.processGetStats(args as any);
            break;

          case "process_send_stdin":
            result = await this.mcpTools.processSendStdin(args as any);
            break;

          case "process_get_output":
            result = await this.mcpTools.processGetOutput(args as any);
            break;

          case "process_list":
            result = await this.mcpTools.processList();
            break;

          case "process_get_status":
            result = await this.mcpTools.processGetStatus(args as any);
            break;

          case "process_create_group":
            result = await this.mcpTools.processCreateGroup(args as any);
            break;

          case "process_add_to_group":
            result = await this.mcpTools.processAddToGroup(args as any);
            break;

          case "process_terminate_group":
            result = await this.mcpTools.processTerminateGroup(args as any);
            break;

          case "process_start_service":
            result = await this.mcpTools.processStartService(args as any);
            break;

          case "process_stop_service":
            result = await this.mcpTools.processStopService(args as any);
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Use ErrorHandler to format the error response
        const errorResponse = ErrorHandler.formatError(error);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Shutdown the server gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      console.error("[MCP Server] Server is not running, skipping shutdown");
      return;
    }

    console.error("[MCP Server] Shutting down gracefully...");
    this.isRunning = false;

    try {
      // Clean up all processes
      const processes = this.processManager.getAll();
      if (processes.length > 0) {
        console.error(
          `[MCP Server] Terminating ${processes.length} managed processes...`
        );

        for (const managedProcess of processes) {
          try {
            console.error(
              `[MCP Server] Terminating process ${managedProcess.pid} (${managedProcess.command})...`
            );
            await this.mcpTools.processTerminate({
              pid: managedProcess.pid,
              force: true,
            });
          } catch (error) {
            console.error(
              `[MCP Server] Error terminating process ${managedProcess.pid}:`,
              error
            );
          }
        }

        console.error("[MCP Server] All processes terminated");
      } else {
        console.error("[MCP Server] No processes to terminate");
      }

      // Stop zombie reaper
      console.error("[MCP Server] Stopping zombie reaper...");
      this.processManager.stopZombieReaper();
      console.error("[MCP Server] Zombie reaper stopped");

      // Close transport
      console.error("[MCP Server] Closing transport...");
      await this.transport.close();
      console.error("[MCP Server] Transport closed");

      console.error("[MCP Server] Shutdown complete");
    } catch (error) {
      console.error("[MCP Server] Error during shutdown:", error);
    } finally {
      process.exit(0);
    }
  }

  /**
   * Get the server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }
}
