#!/usr/bin/env node
/**
 * MCP Process Server - CLI Entry Point
 *
 * Starts the MCP Process Server with stdio transport.
 * Configuration is loaded from file or environment.
 */

import { MCPServer } from "./lib/MCPServer";
import { ConfigLoader } from "./lib/ConfigLoader";

async function main() {
  try {
    // Check for --create-config flag
    if (process.argv.includes("--create-config")) {
      const outputPath =
        process.argv[process.argv.indexOf("--create-config") + 1] ||
        "./mcp-process-config.json";
      ConfigLoader.createSampleConfig(outputPath);
      process.exit(0);
    }

    // Check for --help flag
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      console.error(`
MCP Process Server - Process management for AI agents

Usage:
  mcp-process [options]

Options:
  --help, -h              Show this help message
  --create-config <path>  Create a sample configuration file
  --config <path>         Load configuration from specified file

Environment Variables:
  MCP_PROCESS_CONFIG_PATH  Path to configuration file
  MCP_PROCESS_CONFIG       JSON configuration string

Configuration:
  The server looks for configuration in the following order:
  1. --config command line argument
  2. MCP_PROCESS_CONFIG_PATH environment variable
  3. ./mcp-process-config.json
  4. ./config/mcp-process.json

Security:
  The server enforces strict security boundaries:
  - Only executables in the allowlist can be launched
  - Resource limits prevent runaway processes
  - Audit logging tracks all operations
  - No privilege escalation allowed

For more information, see:
  https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process
      `);
      process.exit(0);
    }

    // Check for --config flag
    let config;
    if (process.argv.includes("--config")) {
      const configPath = process.argv[process.argv.indexOf("--config") + 1];
      if (!configPath) {
        console.error("Error: --config requires a path argument");
        process.exit(1);
      }
      config = ConfigLoader.loadFromFile(configPath);
    }

    // Create and start server
    const server = new MCPServer(config);
    await server.start();

    // Keep process alive
    process.stdin.resume();
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
