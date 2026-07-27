# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Production stage
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001

# Copy necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/admin_mapping_old_to_new_10_25.csv ./

# Set ownership
RUN chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3001

# Start the app only. DB migrations are applied as a separate, one-shot step
# during deploy (see .github/workflows/deploy*.yml) so a failed/interrupted
# migration can never crash-loop the running service (avoids Prisma P3009 lock-out).
CMD ["node", "dist/src/main"]
