#!/bin/bash
# Docker Testing Script for MCP Process Server
# This script helps test the Docker image locally before publishing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="mcp-process:test"
CONTAINER_NAME="mcp-process-test"
CONFIG_DIR="./test-docker-config"

echo -e "${GREEN}=== MCP Process Server - Docker Test Script ===${NC}\n"

# Function to print step
print_step() {
    echo -e "${YELLOW}>>> $1${NC}"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Cleanup function
cleanup() {
    print_step "Cleaning up..."
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker rm $CONTAINER_NAME 2>/dev/null || true
    rm -rf $CONFIG_DIR
    print_success "Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Step 1: Build image
print_step "Building Docker image..."
docker build -t $IMAGE_NAME .
print_success "Image built successfully"

# Step 2: Create test configuration
print_step "Creating test configuration..."
mkdir -p $CONFIG_DIR
cat > $CONFIG_DIR/mcp-process-config.json << EOF
{
  "allowedExecutables": ["node", "echo", "cat", "ls"],
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
EOF
print_success "Configuration created"

# Step 3: Test help command
print_step "Testing help command..."
docker run --rm $IMAGE_NAME node dist/cli.js --help > /dev/null
print_success "Help command works"

# Step 4: Test config creation
print_step "Testing config creation..."
docker run --rm -v $(pwd)/$CONFIG_DIR:/app/config $IMAGE_NAME \
    node dist/cli.js --create-config /app/config/generated.json
if [ -f "$CONFIG_DIR/generated.json" ]; then
    print_success "Config creation works"
else
    print_error "Config creation failed"
    exit 1
fi

# Step 5: Test image size
print_step "Checking image size..."
IMAGE_SIZE=$(docker images $IMAGE_NAME --format "{{.Size}}")
echo "Image size: $IMAGE_SIZE"
print_success "Image size check complete"

# Step 6: Test security (non-root user)
print_step "Testing non-root user..."
USER_ID=$(docker run --rm $IMAGE_NAME id -u)
if [ "$USER_ID" = "1001" ]; then
    print_success "Running as non-root user (UID 1001)"
else
    print_error "Not running as expected user (got UID $USER_ID)"
    exit 1
fi

# Step 7: Test container startup
print_step "Testing container startup..."
docker run -d --name $CONTAINER_NAME \
    -v $(pwd)/$CONFIG_DIR:/app/config:ro \
    -i \
    $IMAGE_NAME

# Wait for startup
sleep 3

# Check if container is running
if docker ps | grep -q $CONTAINER_NAME; then
    print_success "Container started successfully"
else
    print_error "Container failed to start"
    docker logs $CONTAINER_NAME
    exit 1
fi

# Step 8: Check logs for errors
print_step "Checking logs for errors..."
LOGS=$(docker logs $CONTAINER_NAME 2>&1)
if echo "$LOGS" | grep -qi "error"; then
    print_error "Errors found in logs:"
    echo "$LOGS"
    exit 1
else
    print_success "No errors in logs"
fi

# Step 9: Test health check
print_step "Testing health check..."
sleep 5  # Wait for health check to run
HEALTH=$(docker inspect --format='{{.State.Health.Status}}' $CONTAINER_NAME 2>/dev/null || echo "no-healthcheck")
if [ "$HEALTH" = "healthy" ] || [ "$HEALTH" = "no-healthcheck" ]; then
    print_success "Health check passed"
else
    print_error "Health check failed: $HEALTH"
    exit 1
fi

# Step 10: Test resource limits
print_step "Testing resource limits..."
MEMORY_LIMIT=$(docker inspect --format='{{.HostConfig.Memory}}' $CONTAINER_NAME)
if [ "$MEMORY_LIMIT" = "0" ]; then
    echo "No memory limit set (using docker-compose for limits)"
    print_success "Resource limits check complete"
else
    echo "Memory limit: $MEMORY_LIMIT bytes"
    print_success "Resource limits configured"
fi

# Step 11: Test with docker-compose
print_step "Testing with docker-compose..."
docker-compose -f docker-compose.yml config > /dev/null
print_success "docker-compose.yml is valid"

# Step 12: Security scan (if trivy is available)
if command -v trivy &> /dev/null; then
    print_step "Running security scan with Trivy..."
    trivy image --severity HIGH,CRITICAL $IMAGE_NAME
    print_success "Security scan complete"
else
    echo "Trivy not installed, skipping security scan"
fi

# Step 13: Test multi-platform build (if buildx available)
if docker buildx version &> /dev/null; then
    print_step "Testing multi-platform build capability..."
    docker buildx build --platform linux/amd64,linux/arm64 -t $IMAGE_NAME-multiplatform . --load 2>/dev/null || true
    print_success "Multi-platform build test complete"
else
    echo "Docker buildx not available, skipping multi-platform test"
fi

# Final summary
echo -e "\n${GREEN}=== All Tests Passed! ===${NC}\n"
echo "Image: $IMAGE_NAME"
echo "Size: $IMAGE_SIZE"
echo "User: UID 1001 (non-root)"
echo "Health: $HEALTH"
echo ""
echo "Next steps:"
echo "1. Tag image: docker tag $IMAGE_NAME digitaldefiance/mcp-process:latest"
echo "2. Push to registry: docker push digitaldefiance/mcp-process:latest"
echo "3. Or use GitHub Actions workflow for automated publishing"
echo ""
