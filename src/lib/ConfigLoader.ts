/**
 * Configuration Loader
 *
 * Loads and validates security configuration from file or environment.
 * Ensures all required security settings are present and valid.
 */

import * as fs from "fs";
import * as path from "path";
import { SecurityConfig, ResourceLimits } from "../types";

/**
 * Default security configuration
 * Provides secure defaults for all settings
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  // Executable control
  allowedExecutables: [],
  blockSetuidExecutables: true,
  blockShellInterpreters: true,

  // Resource limits
  defaultResourceLimits: {
    maxCpuPercent: 80,
    maxMemoryMB: 1024,
    maxFileDescriptors: 1024,
    maxCpuTime: 300,
    maxProcesses: 10,
  },

  // Process limits
  maxConcurrentProcesses: 10,
  maxProcessLifetime: 3600,

  // Termination control
  allowProcessTermination: true,
  allowGroupTermination: true,
  allowForcedTermination: true,

  // I/O control
  allowStdinInput: true,
  allowOutputCapture: true,

  // Audit
  enableAuditLog: true,
  requireConfirmation: false,
};

/**
 * Configuration loader class
 */
export class ConfigLoader {
  /**
   * Load configuration from file
   */
  static loadFromFile(configPath: string): SecurityConfig {
    try {
      const absolutePath = path.resolve(configPath);
      console.error(
        `[ConfigLoader] Loading configuration from: ${absolutePath}`
      );

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`);
      }

      const fileContent = fs.readFileSync(absolutePath, "utf-8");
      const config = JSON.parse(fileContent);

      return this.validateAndMerge(config);
    } catch (error) {
      console.error("[ConfigLoader] Error loading configuration:", error);
      throw error;
    }
  }

  /**
   * Load configuration from environment variable
   */
  static loadFromEnv(envVar: string = "MCP_PROCESS_CONFIG"): SecurityConfig {
    const configJson = process.env[envVar];

    if (!configJson) {
      throw new Error(`Environment variable ${envVar} not set`);
    }

    try {
      const config = JSON.parse(configJson);
      return this.validateAndMerge(config);
    } catch (error) {
      console.error(
        "[ConfigLoader] Error parsing configuration from environment:",
        error
      );
      throw error;
    }
  }

  /**
   * Load configuration with fallback chain:
   * 1. Try file path from environment variable
   * 2. Try default config file locations
   * 3. Use default configuration
   */
  static load(): SecurityConfig {
    // Try environment variable for config path
    const configPath = process.env["MCP_PROCESS_CONFIG_PATH"];
    if (configPath) {
      try {
        return this.loadFromFile(configPath);
      } catch (error) {
        console.error("[ConfigLoader] Failed to load from env path:", error);
      }
    }

    // Try default locations
    const defaultPaths = [
      "./mcp-process-config.json",
      "./config/mcp-process.json",
      path.join(process.cwd(), "mcp-process-config.json"),
      path.join(process.cwd(), "config", "mcp-process.json"),
    ];

    for (const defaultPath of defaultPaths) {
      if (fs.existsSync(defaultPath)) {
        try {
          return this.loadFromFile(defaultPath);
        } catch (error) {
          console.error(
            `[ConfigLoader] Failed to load from ${defaultPath}:`,
            error
          );
        }
      }
    }

    // Use default configuration
    console.error("[ConfigLoader] No configuration file found, using defaults");
    console.error(
      "[ConfigLoader] WARNING: Default configuration has empty allowlist!"
    );
    return DEFAULT_SECURITY_CONFIG;
  }

  /**
   * Validate and merge configuration with defaults
   */
  private static validateAndMerge(
    config: Partial<SecurityConfig>
  ): SecurityConfig {
    const merged: SecurityConfig = {
      ...DEFAULT_SECURITY_CONFIG,
      ...config,
      defaultResourceLimits: {
        ...DEFAULT_SECURITY_CONFIG.defaultResourceLimits,
        ...(config.defaultResourceLimits || {}),
      },
    };

    // Validate required fields
    this.validateConfig(merged);

    console.error("[ConfigLoader] Configuration loaded successfully");
    console.error(
      `[ConfigLoader] Allowed executables: ${merged.allowedExecutables.length}`
    );
    console.error(
      `[ConfigLoader] Max concurrent processes: ${merged.maxConcurrentProcesses}`
    );
    console.error(
      `[ConfigLoader] Block shell interpreters: ${merged.blockShellInterpreters}`
    );
    console.error(
      `[ConfigLoader] Block setuid executables: ${merged.blockSetuidExecutables}`
    );

    return merged;
  }

  /**
   * Validate configuration
   */
  private static validateConfig(config: SecurityConfig): void {
    // Validate resource limits
    if (!config.defaultResourceLimits) {
      throw new Error(
        "Security configuration error: defaultResourceLimits is required"
      );
    }

    // Validate numeric limits are positive
    if (config.maxConcurrentProcesses <= 0) {
      throw new Error(
        "Security configuration error: maxConcurrentProcesses must be positive"
      );
    }

    if (config.maxProcessLifetime <= 0) {
      throw new Error(
        "Security configuration error: maxProcessLifetime must be positive"
      );
    }

    // Validate resource limits are reasonable
    const limits = config.defaultResourceLimits;
    if (
      limits.maxCpuPercent &&
      (limits.maxCpuPercent <= 0 || limits.maxCpuPercent > 100)
    ) {
      throw new Error(
        "Security configuration error: maxCpuPercent must be between 0 and 100"
      );
    }

    if (limits.maxMemoryMB && limits.maxMemoryMB <= 0) {
      throw new Error(
        "Security configuration error: maxMemoryMB must be positive"
      );
    }

    if (limits.maxCpuTime && limits.maxCpuTime <= 0) {
      throw new Error(
        "Security configuration error: maxCpuTime must be positive"
      );
    }

    // Validate working directories if specified
    if (config.allowedWorkingDirectories) {
      for (const dir of config.allowedWorkingDirectories) {
        if (!path.isAbsolute(dir)) {
          throw new Error(
            `Security configuration error: allowedWorkingDirectories must contain absolute paths. Got: ${dir}`
          );
        }
      }
    }

    console.error("[ConfigLoader] Configuration validation passed");
  }

  /**
   * Create a sample configuration file
   */
  static createSampleConfig(outputPath: string): void {
    const sampleConfig: SecurityConfig = {
      allowedExecutables: ["node", "npm", "yarn", "python3", "git"],
      blockSetuidExecutables: true,
      blockShellInterpreters: true,
      defaultResourceLimits: {
        maxCpuPercent: 80,
        maxMemoryMB: 1024,
        maxFileDescriptors: 1024,
        maxCpuTime: 300,
        maxProcesses: 10,
      },
      maxConcurrentProcesses: 10,
      maxProcessLifetime: 3600,
      allowProcessTermination: true,
      allowGroupTermination: true,
      allowForcedTermination: true,
      allowStdinInput: true,
      allowOutputCapture: true,
      enableAuditLog: true,
      requireConfirmation: false,
    };

    fs.writeFileSync(outputPath, JSON.stringify(sampleConfig, null, 2));
    console.error(
      `[ConfigLoader] Sample configuration written to: ${outputPath}`
    );
  }
}
