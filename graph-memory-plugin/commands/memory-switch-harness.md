# /memory-switch-harness

Switch the agent harness that runs the background memory pipeline.

## Instructions

1. Call `graph_memory(action="status")` to confirm memory is initialized and get current runtime config.
2. If memory is not initialized, tell the user to run `/memory-onboard` first. Stop.
3. Extract the current `runtime.mode`, `runtime.docker.workerProvider`, `runtime.docker.workerModel`, `runtime.docker.fallbackProvider`, and `runtime.docker.fallbackModel` (fall back to showing `codex` as the default primary, and "none" if no fallback is set).
4. Present the current primary harness, current fallback (if any), and available options.
5. Briefly explain each harness:
   - **codex** — OpenAI Codex CLI. Best for ChatGPT subscribers. Requires `codex login`.
   - **claude** — Anthropic Claude Code. Best for Claude subscribers. Uses existing OAuth or `ANTHROPIC_API_KEY`.
   - **pi** — pi coding agent. Open-source, provider-agnostic. Uses subscription or provider API keys.
   - **opencode** — OpenCode. Open-source, provider-agnostic. Uses provider API keys via `opencode providers`.
6. Ask which harness they want as the **primary** (default) worker.
7. Ask if they want to set a model override for pipeline workers (optional). Explain that each harness has a default model, but they can specify one (e.g. `sonnet`, `o3`, `gpt-4.1`). If they don't want to change it, skip.
8. Ask if they want a **fallback** harness (optional but recommended). Explain: when the primary worker fails or times out — e.g. because a provider hit a usage limit — the daemon automatically retries the same job on the fallback harness so pipeline work isn't lost. A good fallback is a *different* provider from the primary (e.g. primary `opencode`, fallback `codex`) so a single provider's limit doesn't block both. Optionally ask for a fallback model too. If they don't want a fallback, skip it.
9. Call `graph_memory(action="configure_runtime", runtimeMode="<current mode: manual or docker>", workerProvider="<chosen>", workerModel="<model> or omit", fallbackProvider="<chosen> or omit", fallbackModel="<model> or omit")`. Always pass `runtimeMode` (it is required) using the current mode from step 3.
10. Confirm the primary + fallback and give restart instructions:
    - Docker mode: "Rebuild and restart the daemon so it picks up the new config: `bin/docker-stop.sh && bin/docker-start.sh` (rebuild the image first with `bin/docker-build.sh` if the plugin code changed)."
    - Manual mode: "Restart any running daemon. Make sure both `<primary>` and any `<fallback>` harness are on PATH."