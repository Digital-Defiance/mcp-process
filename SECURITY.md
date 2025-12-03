# Security Configuration Guide

## Table of Contents

- [Overview](#overview)
- [Security Architecture](#security-architecture)
- [Configuration Options](#configuration-options)
- [Executable Allowlist](#executable-allowlist)
- [Resource Limits](#resource-limits)
- [Working Directory Restrictions](#working-directory-restrictions)
- [What AI Agents CANNOT Do](#what-ai-agents-cannot-do)
- [What AI Agents CAN Do](#what-ai-agents-can-do)
- [Recommended Configurations](#recommended-configurations)
- [Cross-Platform Security](#cross-platform-security)
- [Advanced Security Features](#advanced-security-features)
- [Audit Logging](#audit-logging)
- [Best Practices](#best-practices)

## Overview

The MCP Process Server implements defense-in-depth security with multiple layers of validation to ensure AI agents can only perform authorized operations within strict boundaries. This guide explains how to configure security policies for your deployment.

## Security Architecture

### Six Layers of Validation

Every process launch request goes through six security layers:

1. **Executable Resolution** - Verify executable exists and is accessible
2. **Dangerous Executable Check** - Block known dangerous commands (sudo, rm, dd, etc.)
3. **Shell Interpreter Check** - Optionally block shell access (bash, sh, cmd.exe, etc.)
4. **Privilege Check** - Block setuid/setgid executables (Unix) or admin tools (Windows)
5. **Allowlist Check** - Only permit explicitly allowed executables
6. **Argument Validation** - Prevent command injection via arguments

### Defense-in-Depth Principles

- **Fail Secure**: If any validation layer fails, the operation is rejected
- **Least Privilege**: Processes run with minimal permissions
- **Audit Everything**: All operations are logged for forensics
- **No Bypass**: Security checks cannot be disabled or bypassed at runtime

## Configuration Options

### Complete Configuration Schema

```json
{
  // === EXECUTABLE CONTROL ===
  "allowedExecutables": ["node", "python3", "git"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "additionalBlockedExecutables": [],

  // === ARGUMENT CONTROL ===
  "maxArgumentCount": 100,
  "maxArgumentLength": 4096,
  "blockedArgumentPatterns": [],

  // === ENVIRONMENT CONTROL ===
  "additionalBlockedEnvVars": [],
  "allowedEnvVars": [],
  "maxEnvVarCount": 100,

  // === WORKING DIRECTORY CONTROL ===
  "allowedWorkingDirectories": [],
  "blockedWorkingDirectories": [],

  // === RESOURCE LIMITS ===
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024,
    "maxFileDescriptors": 1024,
    "maxCpuTime": 300,
    "maxProcesses": 10
  },
  "maximumResourceLimits": {
    "maxCpuPercent": 100,
    "maxMemoryMB": 4096,
    "maxFileDescriptors": 2048,
    "maxCpuTime": 3600,
    "maxProcesses": 50
  },
  "strictResourceEnforcement": true,

  // === PROCESS LIMITS ===
  "maxConcurrentProcesses": 10,
  "maxConcurrentProcessesPerAgent": 5,
  "maxProcessLifetime": 3600,
  "maxTotalProcesses": 1000,

  // === RATE LIMITING ===
  "maxLaunchesPerMinute": 10,
  "maxLaunchesPerHour": 100,
  "rateLimitCooldownSeconds": 60,

  // === TERMINATION CONTROL ===
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "requireTerminationConfirmation": false,

  // === I/O CONTROL ===
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "maxOutputBufferSize": 10485760,
  "blockBinaryStdin": false,

  // === AUDIT & MONITORING ===
  "enableAuditLog": true,
  "auditLogPath": "./audit.log",
  "auditLogLevel": "info",
  "enableSecurityAlerts": false,
  "securityAlertWebhook": "",

  // === CONFIRMATION & APPROVAL ===
  "requireConfirmation": false,
  "requireConfirmationFor": [],
  "autoApproveAfterCount": 0
}
```

## Executable Allowlist

### Overview

The executable allowlist is the **most critical security control**. Only executables in this list can be launched by AI agents.

### Configuration

```json
{
  "allowedExecutables": [
    "node", // Basename (searches PATH)
    "/usr/bin/python3", // Absolute path
    "/usr/local/bin/*", // Glob pattern
    "npm",
    "git"
  ]
}
```

### Allowlist Formats

1. **Basename**: `"node"` - Matches any `node` executable in PATH
2. **Absolute Path**: `"/usr/bin/python3"` - Exact path match
3. **Glob Pattern**: `"/usr/bin/*"` - Pattern matching using minimatch

### Hardcoded Dangerous Executables (ALWAYS Blocked)

These executables are **always blocked** regardless of allowlist configuration:

#### Unix/Linux/macOS

- `sudo`, `su`, `doas` - Privilege escalation
- `chmod`, `chown`, `chgrp` - Permission modification
- `rm`, `rmdir` - File deletion
- `dd` - Disk operations
- `mkfs`, `fdisk`, `parted` - Filesystem operations
- `iptables`, `nft` - Firewall configuration
- `systemctl`, `service` - Service management
- `reboot`, `shutdown`, `halt` - System control

#### Windows

- `runas.exe` - Privilege escalation
- `psexec.exe`, `psexec64.exe` - Remote execution
- `del.exe`, `erase.exe` - File deletion
- `format.com`, `diskpart.exe` - Disk operations
- `bcdedit.exe` - Boot configuration
- `reg.exe`, `regedit.exe` - Registry modification
- `sc.exe` - Service control
- `net.exe`, `netsh.exe` - Network configuration
- `wmic.exe` - WMI operations
- `msiexec.exe` - Installer execution
- `taskkill.exe` - Process termination
- `shutdown.exe` - System control

### Shell Interpreter Blocking

When `blockShellInterpreters: true`, these are blocked:

- Unix/Linux/macOS: `bash`, `sh`, `zsh`, `fish`, `csh`, `tcsh`, `ksh`
- Windows: `cmd.exe`, `powershell.exe`, `pwsh.exe`

**Recommendation**: Keep this enabled unless you have a specific need for shell access.

### Setuid/Setgid Blocking

When `blockSetuidExecutables: true`, any executable with setuid or setgid bits is blocked.

**Recommendation**: Keep this enabled to prevent privilege escalation.

## Resource Limits

### Default Resource Limits

Applied to all processes unless overridden:

```json
{
  "defaultResourceLimits": {
    "maxCpuPercent": 80, // Maximum CPU usage (0-100)
    "maxMemoryMB": 1024, // Maximum memory in MB
    "maxFileDescriptors": 1024, // Maximum open files
    "maxCpuTime": 300, // Maximum CPU time in seconds
    "maxProcesses": 10 // Maximum processes in tree
  }
}
```

### Maximum Resource Limits

Hard limits that cannot be exceeded even if requested:

```json
{
  "maximumResourceLimits": {
    "maxCpuPercent": 100,
    "maxMemoryMB": 4096,
    "maxFileDescriptors": 2048,
    "maxCpuTime": 3600,
    "maxProcesses": 50
  }
}
```

### Strict Enforcement

```json
{
  "strictResourceEnforcement": true
}
```

When enabled, processes are terminated **immediately** upon exceeding limits. When disabled, processes get a grace period.

### Process Limits

```json
{
  "maxConcurrentProcesses": 10, // Total across all agents
  "maxConcurrentProcessesPerAgent": 5, // Per agent limit
  "maxProcessLifetime": 3600, // Maximum lifetime in seconds
  "maxTotalProcesses": 1000 // Lifetime of server
}
```

## Working Directory Restrictions

### Allowed Directories

Restrict processes to specific directories:

```json
{
  "allowedWorkingDirectories": ["/home/user/projects", "/tmp/workspace"]
}
```

When set, processes can only run in these directories or their subdirectories.

### Blocked Directories

Explicitly block certain directories:

```json
{
  "blockedWorkingDirectories": ["/etc", "/root", "/var/lib"]
}
```

Blocked directories take precedence over allowed directories.

### Recommendation

For maximum security, use `allowedWorkingDirectories` to create a sandbox:

```json
{
  "allowedWorkingDirectories": ["/home/aiagent/workspace"]
}
```

## What AI Agents CANNOT Do

AI agents are **strictly prevented** from:

### System Operations

- ❌ Launching executables not in the allowlist
- ❌ Launching shell interpreters (if blocked)
- ❌ Launching dangerous system commands (sudo, rm, dd, etc.)
- ❌ Launching setuid/setgid executables
- ❌ Escalating privileges
- ❌ Modifying system configuration
- ❌ Rebooting or shutting down the system

### File Operations

- ❌ Deleting files directly (rm, del)
- ❌ Modifying file permissions (chmod, chown)
- ❌ Accessing arbitrary directories (if restricted)
- ❌ Performing disk operations (dd, format)

### Environment Manipulation

- ❌ Modifying PATH environment variable
- ❌ Setting LD_PRELOAD or DYLD_INSERT_LIBRARIES
- ❌ Manipulating other dangerous environment variables

### Process Operations

- ❌ Sending signals to processes they didn't create
- ❌ Terminating system processes
- ❌ Bypassing resource limits
- ❌ Launching unlimited concurrent processes
- ❌ Keeping processes running indefinitely

### Security Bypasses

- ❌ Executing command injection via arguments
- ❌ Bypassing the allowlist
- ❌ Disabling security checks
- ❌ Modifying configuration at runtime

## What AI Agents CAN Do

Within the configured allowlist and limits, AI agents can:

### Process Management

- ✅ Launch approved executables with arguments
- ✅ Set safe environment variables
- ✅ Specify working directory (within restrictions)
- ✅ Set resource limits (within maximums)
- ✅ Terminate processes they created
- ✅ Create process groups
- ✅ Manage process pipelines

### I/O Operations

- ✅ Capture stdout and stderr
- ✅ Send stdin input
- ✅ Retrieve buffered output
- ✅ Handle binary data (if allowed)

### Monitoring

- ✅ Monitor CPU usage
- ✅ Monitor memory usage
- ✅ Monitor I/O statistics
- ✅ Track process uptime
- ✅ View historical resource data

### Service Management

- ✅ Start long-running services
- ✅ Configure auto-restart
- ✅ Set up health checks
- ✅ Stop services they created

### Advanced Features

- ✅ Create process groups
- ✅ Build process pipelines
- ✅ Set timeout constraints
- ✅ Query process status
- ✅ List managed processes

## Recommended Configurations

### Development Environment (Permissive)

For local development with trusted AI agents:

```json
{
  "allowedExecutables": [
    "node",
    "npm",
    "yarn",
    "npx",
    "python3",
    "pip3",
    "pytest",
    "git",
    "make",
    "tsc",
    "jest"
  ],
  "defaultResourceLimits": {
    "maxCpuPercent": 90,
    "maxMemoryMB": 2048,
    "maxCpuTime": 600
  },
  "maxConcurrentProcesses": 20,
  "maxProcessLifetime": 7200,
  "blockShellInterpreters": false,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": true,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "enableAuditLog": true,
  "requireConfirmation": false
}
```

### Production Environment (Restrictive)

For production with untrusted AI agents:

```json
{
  "allowedExecutables": ["/usr/bin/node", "/usr/bin/python3"],
  "defaultResourceLimits": {
    "maxCpuPercent": 50,
    "maxMemoryMB": 512,
    "maxCpuTime": 300
  },
  "maximumResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024,
    "maxCpuTime": 600
  },
  "maxConcurrentProcesses": 5,
  "maxConcurrentProcessesPerAgent": 2,
  "maxProcessLifetime": 1800,
  "maxLaunchesPerMinute": 5,
  "allowedWorkingDirectories": ["/var/lib/aiagent/workspace"],
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "strictResourceEnforcement": true,
  "allowProcessTermination": true,
  "allowGroupTermination": false,
  "allowForcedTermination": false,
  "allowStdinInput": false,
  "allowOutputCapture": true,
  "enableAuditLog": true,
  "auditLogLevel": "info",
  "enableSecurityAlerts": true,
  "requireConfirmation": true
}
```

### Testing Environment (Minimal)

For automated testing only:

```json
{
  "allowedExecutables": ["jest", "pytest", "mocha", "npm"],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 1024,
    "maxCpuTime": 300
  },
  "maxConcurrentProcesses": 10,
  "maxProcessLifetime": 3600,
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "enableAuditLog": true,
  "requireConfirmation": false
}
```

### Node.js Development

```json
{
  "allowedExecutables": [
    "node",
    "npm",
    "yarn",
    "npx",
    "pnpm",
    "tsc",
    "jest",
    "eslint",
    "prettier"
  ],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 2048,
    "maxCpuTime": 600
  },
  "maxConcurrentProcesses": 15,
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "enableAuditLog": true
}
```

### Python Development

```json
{
  "allowedExecutables": [
    "python3",
    "pip3",
    "pytest",
    "black",
    "flake8",
    "mypy",
    "pylint"
  ],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 2048,
    "maxCpuTime": 600
  },
  "maxConcurrentProcesses": 15,
  "blockShellInterpreters": true,
  "blockSetuidExecutables": true,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": false,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "enableAuditLog": true
}
```

## Cross-Platform Security

### Unix/Linux Security

**Blocked Environment Variables:**

- `LD_PRELOAD`, `LD_LIBRARY_PATH` - Library injection
- `PATH` - Path manipulation
- `PYTHONPATH`, `NODE_PATH`, `PERL5LIB`, `RUBYLIB` - Language paths

**Additional Checks:**

- Setuid/setgid executable detection
- File permission validation
- Process capability checks

### Windows Security

**Blocked Environment Variables:**

- `Path`, `PATH` - Path manipulation (case-insensitive)
- `PATHEXT` - Executable extension manipulation
- `COMSPEC` - Command interpreter manipulation

**Additional Checks:**

- Windows path separator handling (`\` and `/`)
- Case-insensitive executable matching
- UAC elevation detection

### macOS Security

**Blocked Environment Variables:**

- `DYLD_INSERT_LIBRARIES`, `DYLD_LIBRARY_PATH` - Dynamic library injection
- All Unix/Linux blocked variables

**Additional Checks:**

- Setuid/setgid executable detection
- macOS-specific library injection prevention
- Gatekeeper validation

## Advanced Security Features

### Rate Limiting

Prevent abuse by limiting process launches:

```json
{
  "maxLaunchesPerMinute": 10,
  "maxLaunchesPerHour": 100,
  "rateLimitCooldownSeconds": 60
}
```

### Argument Validation

Additional argument security:

```json
{
  "maxArgumentCount": 100,
  "maxArgumentLength": 4096,
  "blockedArgumentPatterns": [".*\\$\\(.*\\).*", ".*`.*`.*", ".*\\|.*", ".*;.*"]
}
```

### Environment Variable Control

Fine-grained environment control:

```json
{
  "allowedEnvVars": ["NODE_ENV", "DEBUG", "LOG_LEVEL"],
  "additionalBlockedEnvVars": ["AWS_SECRET_ACCESS_KEY", "DATABASE_PASSWORD"],
  "maxEnvVarCount": 50
}
```

## Audit Logging

### Configuration

```json
{
  "enableAuditLog": true,
  "auditLogPath": "./audit.log",
  "auditLogLevel": "info"
}
```

### Log Levels

- `error`: Only security violations and errors
- `warn`: Warnings and above
- `info`: Normal operations (recommended)
- `debug`: Detailed debugging information

### Log Format

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "AUDIT",
  "operation": "process_start",
  "executable": "node",
  "pid": 12345,
  "result": "success"
}
```

### Security Violations

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "SECURITY_VIOLATION",
  "type": "not_in_allowlist",
  "details": ["bash", "/bin/bash"]
}
```

## Best Practices

### 1. Start Restrictive

Begin with a minimal allowlist and add executables as needed.

### 2. Use Absolute Paths in Production

Prefer absolute paths over basenames for better security.

### 3. Enable All Security Features

Enable shell blocking, setuid blocking, and strict enforcement.

### 4. Set Conservative Resource Limits

Start with low limits and increase as needed.

### 5. Restrict Working Directories

Use allowedWorkingDirectories to create a sandbox.

### 6. Monitor Audit Logs

Regularly review logs for security violations and unusual patterns.

### 7. Use Rate Limiting

Prevent abuse with rate limits on process launches.

### 8. Test Configuration

Test your configuration thoroughly before deployment.

### 9. Regular Updates

Review and update allowlist and limits regularly.

### 10. Defense in Depth

Use multiple security layers together.

## Support

For security issues or questions:

- GitHub Issues: https://github.com/digital-defiance/ai-capabilities-suite/issues
- Email: info@digitaldefiance.org
- Security vulnerabilities: Please report privately to info@digitaldefiance.org
