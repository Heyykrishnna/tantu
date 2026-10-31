FROM node:24-alpine

WORKDIR /app

COPY server.mjs ./

USER node

EXPOSE 3310

HEALTHCHECK --interval=5s --timeout=3s --retries=3 \
  CMD nc -z 127.0.0.1 3310 || exit 1

CMD ["node", "server.mjs"]

