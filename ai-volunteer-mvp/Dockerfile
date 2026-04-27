# Use the official Node.js image
FROM node:20-bullseye-slim AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
# Copy frontend package files and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./
# Install all dependencies including dev dependencies so the build (Tailwind/PostCSS/Turbopack) succeeds
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# Copy only the frontend app into the build stage
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 8080
ENV PORT=8080

CMD ["npm", "start"]
