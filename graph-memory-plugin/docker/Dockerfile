FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
RUN npm install -g @openai/codex

COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
COPY commands ./commands
COPY agents ./agents
COPY skills ./skills
COPY hooks ./hooks
COPY docker/healthcheck.sh /usr/local/bin/graph-memory-healthcheck

RUN npm run build \
  && chmod +x /usr/local/bin/graph-memory-healthcheck /app/bin/*.sh

ENV GRAPH_MEMORY_DAEMON=1
ENV GRAPH_MEMORY_ROOT=/graph-memory
ENV HOME=/graph-memory-auth

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/graph-memory-healthcheck"]

CMD ["bash", "/app/bin/graph-memory-daemon.sh"]
