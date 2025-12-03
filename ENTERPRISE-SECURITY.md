# Enterprise-Grade Security Configuration

## Overview

The MCP Process Server provides defense-in-depth security with fine-grained controls suitable for enterprise environments. Every aspect of process execution can be restricted and monitored.

## Security Layers

### 1. Executable Control
**What can be launched?**

```json
{
  "allowedExecutables": ["node", "python3", "git"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "additionalBlockedExecutables": ["curl", "wget"]
}
```

- **Allowlist-only**: Only explicitly permitted executables can run
- **Dangerous executable blocklist**: Hardcoded list of dangerous commands (sudo, rm, etc.)
- **Shell blocking**: Prevent shell access entirely
- **Setuid/setgid blocking**: Prevent privilege escalation (Unix/Linux)

### 2. Argument Control
**What arguments can be passed?**

```json
{
  "maxArgumentCount": 20,
  "maxArgumentLength": 1000,
  "blockedArgumentPatterns": ["--unsafe-.*", ".*password.*"]
}
```

- **Injection prevention**: Block command injection patterns ($(), `, |, ;, &)
- **Path traversal prevention**: Block ../ and ..\\
- **Argument limits**: Restrict number and length of arguments
- **Pattern blocking**: Block specific argument patterns via regex

### 3. Environment Control
**What environment variables can be set?**

```json
{
  "additionalBlockedEnvVars": ["AWS_SECRET_KEY", "DATABASE_PASSWORD"],
  "allowedEnvVars": ["NODE_ENV", "LOG_LEVEL"],
  "maxEnvVarCount": 50
}
```

- **Dangerous variable blocking**: Hardcoded list (LD_PRELOAD, PATH, etc.)
- **Allowlist mode**: Only permit specific environment variables
- **Injection prevention**: Block $(), `, newlines in values
- **Size limits**: 4KB per variable, 64KB total

### 4. Working Directory Control
**Where can processes run?**

```json
{
  "allowedWorkingDirectories": ["/app/workspace", "/tmp/sandbox"],
  "blockedWorkingDirectories": ["/etc", "/root", "/home"]
}
```

- **Directory allowlist**: Only permit specific directories
- **Directory blocklist**: Explicitly block sensitive directories
- **Path validation**: Prevent path traversal

### 5. Resource Limits
**How much can processes consume?**

```json
{
  "defaultResourceLimits": {
    "maxCpuPercent": 50,
    "maxMemoryMB": 512,
    "maxFileDescriptors": 100,
    "maxCpuTime": 300,
    "maxProcesses": 5
  },
  "maximumResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 2048
  },
  "strictResourceEnforcement": true
}
```

- **CPU limits**: Percentage and time limits
- **Memory limits**: Maximum RAM usage
- **File descriptor limits**: Prevent resource exhaustion
- **Process tree limits**: Limit child processes
- **Strict enforcement**: Immediate termination on violation

### 6. Process Limits
**How many processes can run?**

```json
{
  "maxConcurrentProcesses": 10,
  "maxConcurrentProcessesPerAgent": 3,
  "maxProcessLifetime": 3600,
  "maxTotalProcesses": 1000
}
```

- **Concurrent limits**: Global and per-agent
- **Lifetime limits**: Maximum execution time
- **Total limits**: Lifetime process count

### 7. Rate Limiting
**How fast can processes be launched?**

```json
{
  "maxLaunchesPerMinute": 10,
  "maxLaunchesPerHour": 100,
  "rateLimitCooldownSeconds": 300
}
```

- **Per-minute limits**: Prevent rapid-fire launches
- **Per-hour limits**: Long-term rate control
- **Cooldown periods**: Enforce waiting after violations

### 8. Termination Control
**What can be terminated?**

```json
{
  "allowProcessTermination": true,
  "allowGroupTermination": false,
  "allowForcedTermination": false,
  "requireTerminationConfirmation": true
}
```

- **Termination permissions**: Control what can be killed
- **Forced termination**: Allow/block SIGKILL
- **Confirmation required**: Human-in-the-loop for termination
- **Managed-only**: Only processes created by agent can be terminated

### 9. I/O Control
**What I/O operations are allowed?**

```json
{
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "maxOutputBufferSize": 10485760,
  "blockBinaryStdin": true
}
```

- **Stdin control**: Allow/block input to processes
- **Output capture**: Allow/block stdout/stderr capture
- **Buffer limits**: Prevent memory exhaustion
- **Binary blocking**: Prevent binary data injection

### 10. Isolation (Unix/Linux)
**How are processes isolated?**

```json
{
  "enableChroot": true,
  "chrootDirectory": "/var/sandbox",
  "enableNamespaces": true,
  "namespaces": {
    "pid": true,
    "network": true,
    "mount": true,
    "uts": true,
    "ipc": true,
    "user": true
  },
  "enableSeccomp": true,
  "seccompProfile": "strict"
}
```

- **Chroot jail**: Restrict filesystem access
- **PID namespace**: Isolate process IDs
- **Network namespace**: Isolate network stack
- **Mount namespace**: Isolate filesystem mounts
- **UTS namespace**: Isolate hostname
- **IPC namespace**: Isolate inter-process communication
- **User namespace**: Map to unprivileged user
- **Seccomp**: Syscall filtering (whitelist allowed syscalls)

### 11. Network Control
**What network access is allowed?**

```json
{
  "blockNetworkAccess": true,
  "allowedNetworkDestinations": ["api.example.com", "10.0.0.0/8"],
  "blockedNetworkDestinations": ["169.254.169.254"]
}
```

- **Network blocking**: Completely disable network access
- **Destination allowlist**: Only permit specific destinations
- **Destination blocklist**: Block metadata services, internal IPs
- **Implemented via**: Network namespaces, iptables, or firewall rules

### 12. Audit & Monitoring
**How is activity tracked?**

```json
{
  "enableAuditLog": true,
  "auditLogPath": "/var/log/mcp-process/audit.log",
  "auditLogLevel": "info",
  "enableSecurityAlerts": true,
  "securityAlertWebhook": "https://alerts.example.com/webhook"
}
```

- **Comprehensive logging**: All operations logged
- **Security violations**: Separate logging for violations
- **Real-time alerts**: Webhook notifications for violations
- **Forensics**: Timestamps, commands, PIDs, results

### 13. Confirmation & Approval
**What requires human approval?**

```json
{
  "requireConfirmation": false,
  "requireConfirmationFor": ["gcc", "make", "docker"],
  "autoApproveAfterCount": 5
}
```

- **Global confirmation**: Require approval for all launches
- **Selective confirmation**: Require approval for specific executables
- **Auto-approval**: Trust after N successful launches
- **Human-in-the-loop**: Prevent autonomous dangerous operations

### 14. Time Restrictions
**When can processes run?**

```json
{
  "allowedTimeWindows": ["Mon-Fri 09:00-17:00"],
  "blockedTimeWindows": ["Sat-Sun *", "* 00:00-06:00"]
}
```

- **Business hours only**: Restrict to working hours
- **Maintenance windows**: Block during maintenance
- **Cron-like syntax**: Flexible time specifications

### 15. Advanced Security (Linux)
**Additional hardening?**

```json
{
  "enableMAC": true,
  "macProfile": "mcp-process-restricted",
  "dropCapabilities": ["CAP_NET_RAW", "CAP_SYS_ADMIN"],
  "readOnlyFilesystem": true,
  "tmpfsSize": 100
}
```

- **SELinux/AppArmor**: Mandatory access control
- **Capability dropping**: Remove Linux capabilities
- **Read-only filesystem**: Prevent file modifications
- **Tmpfs limits**: Limit temporary storage

## Example Configurations

### Maximum Security (Zero Trust)
```json
{
  "allowedExecutables": ["node"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "maxArgumentCount": 10,
  "maxArgumentLength": 500,
  "allowedEnvVars": ["NODE_ENV"],
  "allowedWorkingDirectories": ["/app/sandbox"],
  "defaultResourceLimits": {
    "maxCpuPercent": 25,
    "maxMemoryMB": 256,
    "maxFileDescriptors": 50,
    "maxCpuTime": 60
  },
  "maxConcurrentProcesses": 1,
  "maxConcurrentProcessesPerAgent": 1,
  "maxProcessLifetime": 300,
  "maxLaunchesPerMinute": 5,
  "allowProcessTermination": true,
  "allowGroupTermination": false,
  "allowForcedTermination": false,
  "allowStdinInput": false,
  "allowOutputCapture": true,
  "maxOutputBufferSize": 1048576,
  "enableChroot": true,
  "chrootDirectory": "/var/sandbox",
  "enableNamespaces": true,
  "namespaces": {
    "pid": true,
    "network": true,
    "mount": true,
    "uts": true,
    "ipc": true,
    "user": true
  },
  "enableSeccomp": true,
  "seccompProfile": "strict",
  "blockNetworkAccess": true,
  "enableAuditLog": true,
  "enableSecurityAlerts": true,
  "requireConfirmation": true,
  "readOnlyFilesystem": true
}
```

### Development Environment (Moderate Security)
```json
{
  "allowedExecutables": ["node", "npm", "git", "python3", "pip3"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "allowedWorkingDirectories": ["/home/user/projects"],
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 2048,
    "maxCpuTime": 600
  },
  "maxConcurrentProcesses": 10,
  "maxProcessLifetime": 3600,
  "maxLaunchesPerMinute": 20,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": true,
  "allowStdinInput": true,
  "allowOutputCapture": true,
  "enableAuditLog": true,
  "requireConfirmation": false
}
```

### CI/CD Pipeline (Balanced Security)
```json
{
  "allowedExecutables": ["node", "npm", "yarn", "git", "docker", "kubectl"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": false,
  "allowedWorkingDirectories": ["/ci/workspace"],
  "defaultResourceLimits": {
    "maxCpuPercent": 90,
    "maxMemoryMB": 4096,
    "maxCpuTime": 1800
  },
  "maxConcurrentProcesses": 20,
  "maxProcessLifetime": 7200,
  "allowProcessTermination": true,
  "allowGroupTermination": true,
  "allowForcedTermination": true,
  "enableChroot": true,
  "chrootDirectory": "/ci/sandbox",
  "enableNamespaces": true,
  "enableAuditLog": true,
  "allowedTimeWindows": ["* 00:00-23:59"]
}
```

## What AI Agents CANNOT Do

Even with full configuration, AI agents are restricted from:

1. **Launching executables not in allowlist** - No exceptions
2. **Bypassing security layers** - All 6 layers always enforced
3. **Escalating privileges** - No sudo, setuid, or admin tools
4. **Accessing arbitrary files** - Restricted by chroot/namespaces
5. **Unlimited resource consumption** - Hard limits enforced
6. **Terminating unmanaged processes** - Only their own processes
7. **Modifying security configuration** - Configuration is immutable at runtime
8. **Bypassing rate limits** - Enforced at security manager level
9. **Accessing network** - If blocked by configuration
10. **Running indefinitely** - Maximum lifetime enforced

## Defense in Depth

Multiple overlapping security layers ensure that even if one layer fails, others provide protection:

1. **Allowlist** → Only approved executables
2. **Blocklist** → Dangerous executables always blocked
3. **Argument validation** → Injection prevention
4. **Environment sanitization** → Variable restrictions
5. **Resource limits** → Prevent exhaustion
6. **Isolation** → Chroot/namespaces/seccomp
7. **Network control** → Restrict connectivity
8. **Audit logging** → Complete visibility
9. **Rate limiting** → Prevent abuse
10. **Time restrictions** → Temporal controls

## Compliance & Standards

This security model supports:

- **PCI DSS**: Audit logging, access control, network segmentation
- **HIPAA**: Access controls, audit trails, encryption
- **SOC 2**: Monitoring, logging, access restrictions
- **ISO 27001**: Information security controls
- **NIST**: Defense in depth, least privilege, monitoring

## Recommendations

1. **Start restrictive**: Begin with maximum security, relax as needed
2. **Monitor continuously**: Review audit logs regularly
3. **Update allowlists**: Keep executable lists minimal
4. **Test configurations**: Validate security in staging
5. **Incident response**: Have procedures for security violations
6. **Regular audits**: Review configurations quarterly
7. **Principle of least privilege**: Grant minimum necessary permissions
8. **Defense in depth**: Enable multiple security layers
9. **Immutable infrastructure**: Treat processes as ephemeral
10. **Zero trust**: Verify everything, trust nothing
