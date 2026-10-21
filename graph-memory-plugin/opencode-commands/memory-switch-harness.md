---
description: Switch the worker harness used for pipeline background jobs
---

# /memory-switch-harness

Switch the agent harness that runs the background memory pipeline.

## Instructions

1. Call `graph_memory` with action `status` to confirm memory is initialized and get current runtime config.
2. If memory is not initialized, tell the user to run `/memory-onboard` first. Stop.
3. Extract the current `runtime.mode`, `runtime.docker.workerProvider`, `runtime.docker.workerModel`, `runtime.docker.fallbackProvider`, and `runtime.docker.fallbackModel` (fall back to showing `codex` as the default primary, and "none" if no fallback is set).
4. Present the current primary harness, current fallback (if any), and available options.
5. Briefly explain each harness:
   - **codex** — OpenAI Codex CLI. Best for ChatGPT subscribers. Requires `codex login`.
   - **claude** — Anthropic Claude Code. Best for Claude subscribers. Uses existing OAuth or `ANTHROPIC_API_KEY`.
   - **pi** — pi coding agent. Open-source, provider-agnostic. Uses subscription or provider API keys.
   - **opencode** — OpenCode. Open-source, provider-agnostic. Uses provider API keys via `opencode providers`.
6. Ask which harness they want as the **primary** (default) worker.
7. Ask if they want to set a model override for pipeline workers (optional). Each harness has a default model, but they can specify one (e.g. `sonnet`, `o3`, `gpt-4.1`). The current `workerModel` is shown in status as `runtime.docker.workerModel`.
   - **Local / self-hosted model**: `opencode` and `pi` can drive a local OpenAI-compatible endpoint (LiteLLM, Ollama, LM Studio, llama.cpp, vLLM). Define the provider in the harness config, put its key in `${graphRoot}/.env` (pipeline-scoped, overrides the ambient environment), and set `workerModel` to the fully-qualified `provider/model` id. See `docs/local-model-pipeline.md`.
   - **Choosing a local model without overloading the host.** Do not just offer the user a model list — the wrong pick can evict a model something else is using, or push the host into swap. Walk these in order:
     1. **List what is already loaded.** Ask the user how to enumerate served models on their host, or query the endpoint's `/v1/models`. Note that a served-model list is not a residency list: an alias can be advertised while its backend process is down, and two aliases often share one backend process.
     2. **Prefer a model that is already resident.** Pointing the pipeline at a backend that is already serving costs no additional weight memory — the marginal cost is request queueing, not RAM. Selecting a model that is not currently loaded costs its full weights on top of everything else running.
     3. **If nothing suitable is resident, do the arithmetic before choosing.** Compare the model's on-disk weight size at its quantization, plus its KV cache at the context length it will be served with, against the host's *available* memory — not its total. Report the numbers to the user and let them decide; never start a second model lane on their behalf.
     4. **Check concurrency, not just capacity.** A single-slot server (llama.cpp defaults to `--parallel 1`) serializes every client. If other workloads already share that backend, pipeline jobs queue behind them and the failure mode is a worker timeout, not an out-of-memory error. Say so, and confirm the job timeouts leave room.
   - **Always keep a hosted `fallbackProvider`** when the primary is local — it catches the local host being asleep, unreachable, mid-restart, or saturated, so jobs are retried rather than lost.
8. Ask if they want a **fallback** harness (optional but recommended). When the primary worker fails or times out — e.g. because a provider hit a usage limit — the daemon automatically retries the same job on the fallback harness so pipeline work isn't lost. A good fallback is a *different* provider from the primary (e.g. primary `opencode`, fallback `codex`). Optionally ask for a fallback model too. If they don't want a fallback, skip it.
9. Run `cogni-code configure-runtime --mode <current mode: manual or docker> --worker <chosen> [--worker-model <model>] [--fallback <chosen>] [--fallback-model <model>]` in the shell, leaving out the options they skipped. It prints the previous and new runtime as JSON, and refuses a value outside its expected form.
10. Confirm the primary + fallback and give restart instructions:
    - Docker mode: "Rebuild and restart the daemon so it picks up the new config: `bin/docker-stop.sh && bin/docker-start.sh` (rebuild the image first with `bin/docker-build.sh` if the plugin code changed)."
    - Manual mode: "Restart any running daemon. Make sure both `<primary>` and any `<fallback>` harness are on PATH."
