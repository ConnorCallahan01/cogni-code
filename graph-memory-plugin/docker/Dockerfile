FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && rm -rf /var/lib/apt/lists/*

# Workers commit the graph (`git add -A && git commit` in the auditor, compressor,
# dreamer, and librarian prompts). On Linux hosts the bind-mounted graph keeps the
# host user's uid, and git (running as root here) refuses it as "dubious
# ownership" unless the path is marked safe; Docker Desktop presents it as
# root-owned. The identity matches the graph's existing history.
RUN git config --system user.name "graph-memory" \
  && git config --system user.email "graph-memory@localhost" \
  && git config --system --add safe.directory /graph-memory

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
RUN npm install -g @openai/codex @mariozechner/pi-coding-agent @anthropic-ai/claude-code
RUN ARCH=$(uname -m) && \
    case "$ARCH" in aarch64) GOARCH="arm64" ;; x86_64) GOARCH="amd64" ;; esac && \
    curl -fsSL "https://github.com/anomalyco/opencode/releases/latest/download/opencode-linux-${GOARCH}.tar.gz" \
    | tar xz -C /usr/local/bin opencode

RUN curl -fsSL https://ntn.dev/install.sh | bash

COPY dist ./dist
COPY extensions ./extensions
COPY bin ./bin
COPY commands ./commands
COPY agents ./agents
COPY skills ./skills
COPY hooks ./hooks
COPY opencode-commands ./opencode-commands
COPY docker/healthcheck.sh /usr/local/bin/graph-memory-healthcheck

RUN chmod +x /usr/local/bin/graph-memory-healthcheck /app/bin/*.sh \
  && HOME=/graph-memory-auth bash /app/bin/install-opencode.sh

ENV GRAPH_MEMORY_DAEMON=1
ENV GRAPH_MEMORY_ROOT=/graph-memory
ENV HOME=/graph-memory-auth
ENV TZ=America/Los_Angeles

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD ["/usr/local/bin/graph-memory-healthcheck"]

CMD ["bash", "/app/bin/graph-memory-daemon.sh"]
