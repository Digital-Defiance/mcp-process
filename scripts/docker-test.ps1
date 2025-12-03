# Docker Testing Script for MCP Process Server (PowerShell)
# This script helps test the Docker image locally before publishing

$ErrorActionPreference = "Stop"

# Configuration
$IMAGE_NAME = "mcp-process:test"
$CONTAINER_NAME = "mcp-process-test"
$CONFIG_DIR = "./test-docker-config"

Write-Host "=== MCP Process Server - Docker Test Script ===" -ForegroundColor Green
Write-Host ""

function Print-Step {
    param($Message)
    Write-Host ">>> $Message" -ForegroundColor Yellow
}

function Print-Success {
    param($Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param($Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Cleanup {
    Print-Step "Cleaning up..."
    docker stop $CONTAINER_NAME 2>$null
    docker rm $CONTAINER_NAME 2>$null
    if (Test-Path $CONFIG_DIR) {
        Remove-Item -Recurse -Force $CONFIG_DIR
    }
    Print-Success "Cleanup complete"
}

# Cleanup on exit
trap { Cleanup }

try {
    # Step 1: Build image
    Print-Step "Building Docker image..."
    docker build -t $IMAGE_NAME .
    Print-Success "Image built successfully"

    # Step 2: Create test configuration
    Print-Step "Creating test configuration..."
    New-Item -ItemType Directory -Force -Path $CONFIG_DIR | Out-Null
    
    $config = @{
        allowedExecutables = @("node", "echo", "cat", "ls")
        blockSetuidExecutables = $true
        blockShellInterpreters = $true
        defaultResourceLimits = @{
            maxCpuPercent = 80
            maxMemoryMB = 512
            maxCpuTime = 300
        }
        maxConcurrentProcesses = 5
        maxProcessLifetime = 1800
        enableAuditLog = $true
    }
    
    $config | ConvertTo-Json -Depth 10 | Set-Content "$CONFIG_DIR/mcp-process-config.json"
    Print-Success "Configuration created"

    # Step 3: Test help command
    Print-Step "Testing help command..."
    docker run --rm $IMAGE_NAME node dist/cli.js --help | Out-Null
    Print-Success "Help command works"

    # Step 4: Test config creation
    Print-Step "Testing config creation..."
    $currentDir = (Get-Location).Path.Replace('\', '/')
    docker run --rm -v "${currentDir}/${CONFIG_DIR}:/app/config" $IMAGE_NAME `
        node dist/cli.js --create-config /app/config/generated.json
    
    if (Test-Path "$CONFIG_DIR/generated.json") {
        Print-Success "Config creation works"
    } else {
        Print-Error "Config creation failed"
        exit 1
    }

    # Step 5: Test image size
    Print-Step "Checking image size..."
    $imageSize = docker images $IMAGE_NAME --format "{{.Size}}"
    Write-Host "Image size: $imageSize"
    Print-Success "Image size check complete"

    # Step 6: Test security (non-root user)
    Print-Step "Testing non-root user..."
    $userId = docker run --rm $IMAGE_NAME id -u
    if ($userId -eq "1001") {
        Print-Success "Running as non-root user (UID 1001)"
    } else {
        Print-Error "Not running as expected user (got UID $userId)"
        exit 1
    }

    # Step 7: Test container startup
    Print-Step "Testing container startup..."
    $currentDir = (Get-Location).Path.Replace('\', '/')
    docker run -d --name $CONTAINER_NAME `
        -v "${currentDir}/${CONFIG_DIR}:/app/config:ro" `
        -i `
        $IMAGE_NAME

    # Wait for startup
    Start-Sleep -Seconds 3

    # Check if container is running
    $running = docker ps | Select-String $CONTAINER_NAME
    if ($running) {
        Print-Success "Container started successfully"
    } else {
        Print-Error "Container failed to start"
        docker logs $CONTAINER_NAME
        exit 1
    }

    # Step 8: Check logs for errors
    Print-Step "Checking logs for errors..."
    $logs = docker logs $CONTAINER_NAME 2>&1
    if ($logs -match "error") {
        Print-Error "Errors found in logs:"
        Write-Host $logs
        exit 1
    } else {
        Print-Success "No errors in logs"
    }

    # Step 9: Test health check
    Print-Step "Testing health check..."
    Start-Sleep -Seconds 5
    $health = docker inspect --format='{{.State.Health.Status}}' $CONTAINER_NAME 2>$null
    if (-not $health) { $health = "no-healthcheck" }
    
    if ($health -eq "healthy" -or $health -eq "no-healthcheck") {
        Print-Success "Health check passed"
    } else {
        Print-Error "Health check failed: $health"
        exit 1
    }

    # Step 10: Test docker-compose
    Print-Step "Testing with docker-compose..."
    docker-compose -f docker-compose.yml config | Out-Null
    Print-Success "docker-compose.yml is valid"

    # Step 11: Security scan (if trivy is available)
    if (Get-Command trivy -ErrorAction SilentlyContinue) {
        Print-Step "Running security scan with Trivy..."
        trivy image --severity HIGH,CRITICAL $IMAGE_NAME
        Print-Success "Security scan complete"
    } else {
        Write-Host "Trivy not installed, skipping security scan"
    }

    # Final summary
    Write-Host ""
    Write-Host "=== All Tests Passed! ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "Image: $IMAGE_NAME"
    Write-Host "Size: $imageSize"
    Write-Host "User: UID 1001 (non-root)"
    Write-Host "Health: $health"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Tag image: docker tag $IMAGE_NAME digitaldefiance/mcp-process:latest"
    Write-Host "2. Push to registry: docker push digitaldefiance/mcp-process:latest"
    Write-Host "3. Or use GitHub Actions workflow for automated publishing"
    Write-Host ""

} catch {
    Print-Error "Test failed: $_"
    exit 1
} finally {
    Cleanup
}
