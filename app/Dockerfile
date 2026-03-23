# ── Builder stage ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /build

# Build tools for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install all deps (including devDependencies for Vite build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production-only install in separate dir to avoid carrying devDependencies
RUN mkdir /prodmod && cp package.json package-lock.json /prodmod/
RUN cd /prodmod && npm ci --omit=dev

# ── Runtime stage ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

WORKDIR /app

COPY --from=builder /prodmod/node_modules ./node_modules
COPY --from=builder /build/dist          ./dist
COPY --from=builder /build/server        ./server
COPY --from=builder /build/package.json  ./package.json

EXPOSE 3001

CMD ["npm", "start"]
