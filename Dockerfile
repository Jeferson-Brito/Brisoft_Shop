FROM node:24-alpine AS builder

WORKDIR /app

# Build frontend (client)
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Stage 2: Production runtime
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install production server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

# Copy server files
COPY server/ ./server/

# Copy compiled frontend from builder
COPY --from=builder /app/client/dist ./client/dist

EXPOSE 3000

WORKDIR /app/server
CMD ["npm", "start"]
