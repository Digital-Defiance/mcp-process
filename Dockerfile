# MCP ACS Process Server - Optimized Docker Image
# Multi-stage build for minimal image size and security

# Stage 1: Build
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Enable Corepack for Yarn
RUN corepack enable

# Set working directory
WORKDIR /build

# Copy package files and yarn configuration
COPY package.json ./
COPY tsconfig*.json ./
COPY .yarnrc.yml ./
COPY yarn.lock ./

# Install dependencies (including dev dependencies for build)
RUN yarn install

# Copy source code
COPY src ./src

# Build the project
RUN yarn build

# Stage 2: Runtime
FROM node:18-alpine

# Install runtime dependencies for process monitoring
RUN apk add --no-cache \
    tini \
    procps \
    && rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S mcp && \
    adduser -u 1001 -S mcp -G mcp

# Set working directory
WORKDIR /app

# Copy built application and dependencies from builder
COPY --from=builder --chown=mcp:mcp /build/dist ./dist
COPY --from=builder --chown=mcp:mcp /build/node_modules ./node_modules
COPY --from=builder --chown=mcp:mcp /build/package.json ./

# Copy documentation
COPY --chown=mcp:mcp README.md LICENSE ./

# Create config directory
RUN mkdir -p /app/config && chown mcp:mcp /app/config

# Create volume for configuration
VOLUME ["/app/config"]

# Switch to non-root user
USER mcp

# Set environment variables
ENV NODE_ENV=production \
    MCP_PROCESS_CONFIG_PATH=/app/config/mcp-process-config.json

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "process.exit(0)"

# Use tini as init system to handle signals properly
ENTRYPOINT ["/sbin/tini", "--"]

# Start the MCP server
CMD ["node", "dist/cli.js"]

# Labels for metadata
LABEL org.opencontainers.image.title="MCP ACS Process Server" \
      org.opencontainers.image.description="Process management and monitoring for AI agents with strict security boundaries" \
      org.opencontainers.image.vendor="Digital Defiance" \
      org.opencontainers.image.authors="info@digitaldefiance.org" \
      org.opencontainers.image.url="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.documentation="https://github.com/digital-defiance/ai-capabilities-suite/tree/main/packages/mcp-process" \
      org.opencontainers.image.source="https://github.com/digital-defiance/ai-capabilities-suite" \
      org.opencontainers.image.licenses="MIT"
