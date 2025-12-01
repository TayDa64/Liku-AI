# =============================================================================
# Liku-AI Docker Image
# Multi-stage build for minimal production image
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
# Node 22 LTS Alpine - fewer CVEs than Node 20
FROM node:22-alpine AS builder

# Update Alpine packages to get latest security patches
RUN apk upgrade --no-cache

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY commands/ ./commands/

# Build TypeScript
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
# Node 22 LTS Alpine - fewer CVEs than Node 20
FROM node:22-alpine AS production

# Update Alpine packages to get latest security patches
RUN apk upgrade --no-cache

# Install runtime dependencies for native modules
RUN apk add --no-cache libstdc++

# Create non-root user for security
RUN addgroup -g 1001 -S liku && \
    adduser -S -u 1001 -G liku liku

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/commands ./commands

# Create data directory for SQLite database
RUN mkdir -p /data && chown -R liku:liku /data /app

# Switch to non-root user
USER liku

# Environment variables
ENV NODE_ENV=production
ENV LIKU_DATA_DIR=/data
ENV LIKU_WS_PORT=3847
ENV LIKU_WS_HOST=0.0.0.0

# Expose WebSocket port
EXPOSE 3847

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "const ws = new (require('ws'))('ws://localhost:3847'); ws.on('open', () => { ws.close(); process.exit(0); }); ws.on('error', () => process.exit(1)); setTimeout(() => process.exit(1), 4000);"

# Start the application
# Note: In container mode, we run in headless/server mode
CMD ["node", "dist/index.js", "--server"]

# -----------------------------------------------------------------------------
# Labels
# -----------------------------------------------------------------------------
LABEL org.opencontainers.image.title="Liku-AI"
LABEL org.opencontainers.image.description="AI-Enhanced Terminal Game Platform with WebSocket API"
LABEL org.opencontainers.image.version="2.0.0-alpha.1"
LABEL org.opencontainers.image.source="https://github.com/TayDa64/LikuBuddy"
LABEL org.opencontainers.image.licenses="MIT"
