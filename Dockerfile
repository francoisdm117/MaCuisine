# --- BUILD STAGE ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files
COPY package*.json tsconfig.json vite.config.ts ./

# Install all dependencies (including devDependencies for esbuild & vite)
RUN npm ci

# Copy the rest of the application files
COPY . .

# Run production build (compiles react app and bundles the typescript server)
RUN npm run build


# --- PRODUCTION RUNTIME STAGE ---
FROM node:20-alpine AS runner

WORKDIR /app

# Set env to production
ENV NODE_ENV=production

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies to keep the image lightweight
RUN npm ci --omit=dev

# Create a dedicated directory for local persistence (server-data/db.json)
RUN mkdir -p /app/server-data /app/recipes && \
    chown -R node:node /app

# Expose port 3000
EXPOSE 3000

# Do not run the application as root.
USER node

# Run the app
CMD ["node", "dist/server.cjs"]
