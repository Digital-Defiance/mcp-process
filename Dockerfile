# Dockerfile for MCP ACS Process Server
# Installs the published NPM package

FROM node:18-alpine

# Install runtime dependencies for process monitoring
RUN apk add --no-cache \
    tini \
    procps

# Create non-root user for security
RUN addgroup -g 1001 -S mcp && \
    adduser -u 1001 -S mcp -G mcp

# Set working directory
WORKDIR /app

# Install the published package from NPM
RUN npm install -g @ai-capabilities-suite/mcp-process@1.5.9

# Set environment variables
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    MCP_PROCESS_CONFIG_PATH=/app/config/mcp-process-config.json

# Create config directory
RUN mkdir -p /app/config && chown mcp:mcp /app/config

# Create volume for configuration
VOLUME ["/app/config"]

# Switch to non-root user
USER mcp

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Run the MCP server
CMD ["mcp-process"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

# Labels for metadata
LABEL org.opencontainers.image.title="MCP ACS Process Server" \
      org.opencontainers.image.description="Process management and monitoring for AI agents with strict security boundaries" \
      org.opencontainers.image.version="1.5.9" \
      org.opencontainers.image.vendor="Digital Defiance" \
      org.opencontainers.image.authors="Jessica Mulein <jessica@digitaldefiance.org>" \
      org.opencontainers.image.url="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.documentation="https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process" \
      org.opencontainers.image.source="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.licenses="MIT"
