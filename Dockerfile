FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat python3 make g++

COPY tooling/minimatch-compat ./tooling/minimatch-compat
COPY frontend/.npmrc ./frontend/.npmrc
COPY backend/.npmrc ./backend/.npmrc

COPY package.json package-lock.json* ./
COPY frontend/package.json frontend/package-lock.json* ./frontend/
COPY backend/package.json backend/package-lock.json* ./backend/
COPY discovery/package.json discovery/package-lock.json* ./discovery/

RUN npm --prefix backend ci && npm --prefix frontend ci

COPY . .

RUN npm --prefix backend run build
ARG BACKEND_ORIGIN=http://backend:4000
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN
RUN npm --prefix frontend run build

FROM node:24-alpine AS runner

WORKDIR /app

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 tantu

RUN mkdir -p /data/files && \
  chown -R tantu:nodejs /data/files && \
  chmod 700 /data/files

COPY --from=builder /app/package.json ./
COPY --from=builder /app/backend/package.json ./backend/
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/node_modules ./backend/node_modules
COPY --from=builder /app/backend/migrations ./backend/migrations
COPY --from=builder /app/backend/scripts ./backend/scripts
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/package.json ./frontend/package.json

USER tantu

EXPOSE 4000 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:4000/health/live || exit 1

CMD ["node", "backend/dist/server.js"]
