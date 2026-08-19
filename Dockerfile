# Dockerfile for Upstox ORB Trading Bot
# Multi-stage build for minimal production image

# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Install dumb-init for proper signal handling (graceful shutdown on SIGINT/SIGTERM)
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S botuser && adduser -u 1001 -S botuser -G botuser

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY src/ ./src/
COPY config/ ./config/
COPY dashboard/ ./dashboard/
COPY package.json ./

# Create directories for logs and data (writable by botuser)
RUN mkdir -p logs data && chown -R botuser:botuser /app

# Switch to non-root user
USER botuser

# Expose dashboard port
EXPOSE 3000

# Health check — hits the dashboard server every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Use dumb-init to forward signals correctly to Node.js
ENTRYPOINT ["dumb-init", "--"]

# Default: run the live bot
# Override with: docker run ... npm run dashboard
CMD ["node", "src/bot/run-live-bot.js"]
