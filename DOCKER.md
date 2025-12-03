# MCP Process Server - Docker Guide

This guide explains how to run the MCP Process Server using Docker.

## Quick Start

### 1. Pull the Image

```bash
docker pull digitaldefiance/mcp-process:latest
```

### 2. Create Configuration Directory

```bash
mkdir -p config
```

### 3. Create Configuration File

Create `config/mcp-process-config.json`:

```json
{
  "allowedExecutables": ["node", "python3", "npm", "git"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "defaultResourceLimits": {
    "maxCpuPercent": 80,
    "maxMemoryMB": 512,
    "maxCpuTime": 300
  },
  "maxConcurrentProcesses": 5,
  "maxProcessLifetime": 1800,
  "enableAuditLog": true
}
```

### 4. Run with Docker Compose

```bash
docker-compose up -d
```

Or run directly with Docker:

```bash
docker run -d \
  --name mcp-process \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add SETUID \
  --cap-add SETGID \
  --memory 2g \
  --cpus 2.0 \
  -v $(pwd)/config:/app/config:ro \
  -i \
  digitaldefiance/mcp-process:latest
```

## Configuration

### Using docker-compose.yml

The provided `docker-compose.yml` includes secure defaults:

- **Security**: Runs as non-root user (UID 1001)
- **Capabilities**: Minimal Linux capabilities
- **Resources**: CPU and memory limits
- **Network**: Disabled (stdio transport only)
- **Volumes**: Configuration mounted read-only

### Environment Variables

- `NODE_ENV`: Set to `production` (default)
- `MCP_PROCESS_CONFIG_PATH`: Path to configuration file (default: `/app/config/mcp-process-config.json`)

### Volumes

Mount your configuration directory:

```yaml
volumes:
  - ./config:/app/config:ro
```

Optionally mount a workspace directory for process execution:

```yaml
volumes:
  - ./config:/app/config:ro
  - ./workspace:/workspace:rw
```

## Security Considerations

### Container Security

The Docker image implements multiple security layers:

1. **Non-root User**: Runs as UID 1001 (user `mcp`)
2. **Minimal Base**: Uses Alpine Linux for small attack surface
3. **No New Privileges**: Prevents privilege escalation
4. **Capability Dropping**: Removes all capabilities except essential ones
5. **Read-only Filesystem**: Configuration mounted read-only
6. **Resource Limits**: CPU and memory constraints

### Application Security

The MCP Process Server enforces:

1. **Executable Allowlist**: Only approved executables can run
2. **Shell Blocking**: Shell interpreters blocked by default
3. **Setuid Blocking**: No setuid/setgid executables
4. **Resource Limits**: Per-process CPU and memory limits
5. **Audit Logging**: All operations logged

### Recommended Configuration

For production use, we recommend:

```json
{
  "allowedExecutables": ["node", "python3", "npm"],
  "blockSetuidExecutables": true,
  "blockShellInterpreters": true,
  "defaultResourceLimits": {
    "maxCpuPercent": 50,
    "maxMemoryMB": 256,
    "maxCpuTime": 180
  },
  "maxConcurrentProcesses": 3,
  "maxProcessLifetime": 900,
  "enableAuditLog": true,
  "requireConfirmation": false
}
```

## Building the Image

### Build Locally

```bash
docker build -t mcp-process:local .
```

### Build with Docker Compose

```bash
docker-compose build
```

### Multi-platform Build

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t digitaldefiance/mcp-process:latest \
  --push \
  .
```

## Usage Examples

### Example 1: Basic Usage

```bash
# Start the server
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the server
docker-compose down
```

### Example 2: Custom Configuration

```bash
# Create custom config
cat > config/custom-config.json << EOF
{
  "allowedExecutables": ["node", "npm", "jest"],
  "maxConcurrentProcesses": 10,
  "enableAuditLog": true
}
EOF

# Run with custom config
docker run -d \
  -v $(pwd)/config:/app/config:ro \
  -e MCP_PROCESS_CONFIG_PATH=/app/config/custom-config.json \
  -i \
  digitaldefiance/mcp-process:latest
```

### Example 3: Development Mode

```bash
# Copy override example
cp docker-compose.override.yml.example docker-compose.override.yml

# Edit override for your needs
vim docker-compose.override.yml

# Start with override
docker-compose up -d
```

### Example 4: Connecting from AI Agent

Configure your AI agent (e.g., Kiro, Claude Desktop) to connect via Docker:

```json
{
  "mcpServers": {
    "process": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "${workspaceFolder}/config:/app/config:ro",
        "digitaldefiance/mcp-process:latest"
      ]
    }
  }
}
```

## Troubleshooting

### Issue: Container exits immediately

**Cause**: No stdin connection or configuration error.

**Solution**: Ensure you're running with `-i` flag and have valid configuration.

### Issue: Permission denied errors

**Cause**: Volume mount permissions.

**Solution**: Ensure config directory is readable:

```bash
chmod -R 755 config
```

### Issue: Cannot execute processes

**Cause**: Executables not in allowlist or not available in container.

**Solution**:

1. Add executables to allowlist in config
2. Install required tools in custom Dockerfile:

```dockerfile
FROM digitaldefiance/mcp-process:latest

USER root
RUN apk add --no-cache python3 git
USER mcp
```

### Issue: Resource limits too restrictive

**Cause**: Docker resource limits or application limits too low.

**Solution**: Adjust in docker-compose.yml:

```yaml
deploy:
  resources:
    limits:
      cpus: "4.0"
      memory: 4G
```

And in configuration:

```json
{
  "defaultResourceLimits": {
    "maxCpuPercent": 90,
    "maxMemoryMB": 1024
  }
}
```

## Health Checks

The container includes a health check that runs every 30 seconds:

```bash
# Check container health
docker inspect --format='{{.State.Health.Status}}' mcp-process

# View health check logs
docker inspect --format='{{range .State.Health.Log}}{{.Output}}{{end}}' mcp-process
```

## Logs and Monitoring

### View Logs

```bash
# Docker Compose
docker-compose logs -f

# Docker
docker logs -f mcp-process
```

### Audit Logs

Audit logs are written to stdout and captured by Docker:

```bash
# Filter for security violations
docker logs mcp-process 2>&1 | grep SECURITY_VIOLATION

# Filter for audit events
docker logs mcp-process 2>&1 | grep AUDIT
```

### Resource Monitoring

```bash
# Monitor container resources
docker stats mcp-process

# Detailed inspection
docker inspect mcp-process
```

## Advanced Configuration

### Custom Dockerfile

Create a custom image with additional tools:

```dockerfile
FROM digitaldefiance/mcp-process:latest

USER root

# Install additional tools
RUN apk add --no-cache \
    python3 \
    py3-pip \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Install Python packages
RUN pip3 install --no-cache-dir pytest black flake8

USER mcp
```

Build and use:

```bash
docker build -t mcp-process:custom -f Dockerfile.custom .
docker run -d -i -v $(pwd)/config:/app/config:ro mcp-process:custom
```

### Kubernetes Deployment

Example Kubernetes deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-process
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mcp-process
  template:
    metadata:
      labels:
        app: mcp-process
    spec:
      securityContext:
        runAsUser: 1001
        runAsGroup: 1001
        fsGroup: 1001
      containers:
        - name: mcp-process
          image: digitaldefiance/mcp-process:latest
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
              add:
                - CHOWN
                - SETUID
                - SETGID
            readOnlyRootFilesystem: false
          resources:
            limits:
              cpu: "2"
              memory: "2Gi"
            requests:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config
              mountPath: /app/config
              readOnly: true
      volumes:
        - name: config
          configMap:
            name: mcp-process-config
```

## Support

For issues and questions:

- GitHub Issues: https://github.com/digital-defiance/ai-capabilities-suite/issues
- Documentation: https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process
- Email: info@digitaldefiance.org
