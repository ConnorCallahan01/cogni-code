# Pinned by digest: a tag can be repointed at a different image. Dependabot
# proposes digest bumps.
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370

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

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
# Worker CLIs are pinned so a rebuild can't silently change how the pipeline
# runs: codex, pi, and Claude Code install from docker/worker-clis' lockfile
# (transitive dependencies included), opencode by version and checksum.
# These are the versions the 3.7.x pipeline was verified on; bump deliberately
# and re-verify.
COPY docker/worker-clis/package.json docker/worker-clis/package-lock.json /opt/worker-clis/
RUN cd /opt/worker-clis && npm ci --omit=dev --no-audit --no-fund
ENV PATH=/opt/worker-clis/node_modules/.bin:$PATH

# The checksums are the release's own asset digests. opencode names its x86_64
# build "x64", not "amd64".
ARG OPENCODE_VERSION=1.18.35
ARG OPENCODE_SHA256_ARM64=f7f2ba59ee8aa94d388f9696575a32d20e71c2ee48def9f80fc693a60fec6c72
ARG OPENCODE_SHA256_X64=c8f888b451f5494a18f858fffb0e0b68f4e4baa9c241761c5f206884f0fa640d
RUN case "$(uname -m)" in \
      aarch64) ASSET=arm64; SHA="$OPENCODE_SHA256_ARM64" ;; \
      x86_64) ASSET=x64; SHA="$OPENCODE_SHA256_X64" ;; \
      *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;; \
    esac && \
    curl -fsSL -o /tmp/opencode.tar.gz "https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/opencode-linux-${ASSET}.tar.gz" && \
    echo "$SHA  /tmp/opencode.tar.gz" | sha256sum -c - && \
    tar xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode && \
    rm /tmp/opencode.tar.gz

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
