# Docker Hub Publishing Setup

This guide explains how to set up GitHub Actions to automatically publish Docker images to Docker Hub and GitHub Container Registry.

## Prerequisites

1. Docker Hub account
2. GitHub repository with Actions enabled
3. Repository secrets configured

## Step 1: Create Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com/)
2. Go to Account Settings → Security
3. Click "New Access Token"
4. Name: `github-actions-mcp-process`
5. Permissions: Read, Write, Delete
6. Copy the generated token (you won't see it again!)

## Step 2: Configure GitHub Secrets

Add the following secrets to your GitHub repository:

1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add these secrets:

### Required Secrets

- **DOCKERHUB_USERNAME**: Your Docker Hub username
- **DOCKERHUB_TOKEN**: The access token from Step 1

### Optional Secrets

- **DOCKERHUB_REPOSITORY**: Override default repository name (default: `digitaldefiance/mcp-process`)

## Step 3: Verify Workflow File

The workflow file is located at `.github/workflows/docker-publish.yml`.

Key features:

- **Multi-platform builds**: Builds for `linux/amd64` and `linux/arm64`
- **Automatic tagging**: Tags based on branch, PR, semver, and SHA
- **Security scanning**: Trivy vulnerability scanner
- **SBOM generation**: Software Bill of Materials
- **Automated testing**: Smoke tests after build
- **Docker Hub description**: Auto-updates README on Docker Hub

## Step 4: Trigger Workflow

The workflow triggers on:

- **Push to main/develop**: Builds and pushes with branch tag
- **Push tags (v\*.\*.\*)**: Builds and pushes with version tags
- **Pull requests**: Builds only (no push)
- **Manual trigger**: Via GitHub Actions UI

### Manual Trigger

1. Go to Actions tab in GitHub
2. Select "Docker Build and Publish"
3. Click "Run workflow"
4. Select branch
5. Click "Run workflow"

## Step 5: Verify Publication

After workflow completes:

1. Check Docker Hub: https://hub.docker.com/r/digitaldefiance/mcp-process
2. Check GitHub Packages: https://github.com/digital-defiance/ai-capabilities-suite/pkgs/container/mcp-process
3. Pull and test:

```bash
docker pull digitaldefiance/mcp-process:latest
docker run --rm digitaldefiance/mcp-process:latest node dist/cli.js --help
```

## Workflow Stages

### 1. Build and Push

- Sets up QEMU for multi-platform builds
- Sets up Docker Buildx
- Logs in to Docker Hub and GHCR
- Extracts metadata for tags and labels
- Builds and pushes images
- Runs Trivy security scan
- Generates SBOM
- Updates Docker Hub description

### 2. Test Image

- Pulls the built image
- Tests help command
- Tests config creation
- Runs security scan
- Performs smoke test

### 3. Notify

- Reports success or failure
- Can be extended to send notifications (Slack, email, etc.)

## Image Tags

The workflow creates multiple tags:

- `latest`: Latest build from main branch
- `develop`: Latest build from develop branch
- `v1.2.3`: Semantic version tag
- `v1.2`: Major.minor version
- `v1`: Major version
- `main-abc123`: Branch name + commit SHA
- `pr-123`: Pull request number

## Security Features

### Vulnerability Scanning

Trivy scans for:

- OS package vulnerabilities
- Application dependencies
- Misconfigurations
- Secrets in image

Results uploaded to GitHub Security tab.

### SBOM Generation

Software Bill of Materials (SBOM) in SPDX format:

- Lists all packages and dependencies
- Tracks versions and licenses
- Uploaded as workflow artifact

### Image Signing (Optional)

To enable image signing with Cosign:

1. Generate signing key:

```bash
cosign generate-key-pair
```

2. Add secrets:

   - `COSIGN_PRIVATE_KEY`: Private key
   - `COSIGN_PASSWORD`: Key password

3. Add signing step to workflow:

```yaml
- name: Sign image
  run: |
    cosign sign --key env://COSIGN_PRIVATE_KEY \
      ${{ env.IMAGE_NAME }}:${{ steps.meta.outputs.version }}
  env:
    COSIGN_PRIVATE_KEY: ${{ secrets.COSIGN_PRIVATE_KEY }}
    COSIGN_PASSWORD: ${{ secrets.COSIGN_PASSWORD }}
```

## Troubleshooting

### Issue: Authentication failed

**Cause**: Invalid Docker Hub credentials.

**Solution**:

1. Verify DOCKERHUB_USERNAME is correct
2. Regenerate DOCKERHUB_TOKEN
3. Update GitHub secret

### Issue: Build fails on ARM64

**Cause**: QEMU not set up correctly.

**Solution**: Ensure `docker/setup-qemu-action@v3` step runs before build.

### Issue: Push denied

**Cause**: Insufficient permissions on Docker Hub token.

**Solution**: Regenerate token with Read, Write, Delete permissions.

### Issue: Workflow doesn't trigger

**Cause**: Workflow file not in correct location or branch.

**Solution**:

1. Ensure file is at `.github/workflows/docker-publish.yml`
2. Ensure file is committed to main branch
3. Check Actions tab for errors

### Issue: Security scan fails

**Cause**: Critical vulnerabilities found.

**Solution**:

1. Review Trivy results in Security tab
2. Update base image or dependencies
3. Add exceptions if false positives

## Customization

### Change Image Name

Edit workflow file:

```yaml
env:
  IMAGE_NAME: your-dockerhub-username/your-image-name
```

### Add Additional Registries

Add login and metadata steps:

```yaml
- name: Log in to Custom Registry
  uses: docker/login-action@v3
  with:
    registry: registry.example.com
    username: ${{ secrets.CUSTOM_REGISTRY_USERNAME }}
    password: ${{ secrets.CUSTOM_REGISTRY_TOKEN }}
```

### Customize Build Args

Add to build step:

```yaml
build-args: |
  NODE_VERSION=20
  CUSTOM_ARG=value
```

### Add Notifications

Add notification step:

```yaml
- name: Notify Slack
  if: always()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## Best Practices

1. **Use semantic versioning**: Tag releases with `v1.2.3` format
2. **Test before merging**: PR builds verify changes
3. **Monitor security**: Review Trivy results regularly
4. **Keep secrets secure**: Rotate tokens periodically
5. **Document changes**: Update DOCKER.md with breaking changes
6. **Pin action versions**: Use specific versions (e.g., `@v3`)
7. **Cache layers**: Workflow uses GitHub Actions cache
8. **Multi-platform**: Build for both AMD64 and ARM64

## Maintenance

### Update Base Image

1. Edit Dockerfile to use newer Node.js version
2. Test locally
3. Push to trigger workflow
4. Verify new image works

### Update Dependencies

1. Update package.json
2. Rebuild image
3. Run security scan
4. Update SBOM

### Rotate Secrets

1. Generate new Docker Hub token
2. Update GitHub secret
3. Trigger workflow to verify
4. Revoke old token

## Support

For issues with Docker publishing:

- GitHub Issues: https://github.com/digital-defiance/ai-capabilities-suite/issues
- Docker Hub: https://hub.docker.com/r/digitaldefiance/mcp-process
- Email: info@digitaldefiance.org
