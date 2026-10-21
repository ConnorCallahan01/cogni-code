# Running the pipeline on a local model

The background pipeline (scribe, auditor, librarian, dreamer, observer, compressor,
…) runs through an agentic CLI harness. Every job prompt is agentic — *"read the
instructions at `<path>`, read these files, write your output JSON to `<dir>`"* —
and the daemon collects results by scanning the filesystem for the artifacts the
worker wrote, never by parsing the worker's stdout. A local model therefore has to
be driven by something that can read and write files: point an existing harness
(`opencode` or `pi`) at a local OpenAI-compatible endpoint rather than calling
`/v1/chat/completions` directly.

Anything exposing an OpenAI-compatible API works: LiteLLM, Ollama, LM Studio,
llama.cpp's server, vLLM.

## 1. Mint a credential for the pipeline alone

Give the pipeline its own key rather than reusing one issued to another agent, so
its usage is separately attributable and separately revocable. With a LiteLLM
gateway that is one virtual key scoped to the model aliases the pipeline may use.

Name the key after the installation it serves, not after the machine or the
person — a gateway usually surfaces the key name as the label in its usage
dashboards, and one box often hosts several agents belonging to the same human.
`cogni-code-pipeline` tells you who is spending; `laptop` does not.

Scope the key to aliases whose backends are already running. A key that cannot
select a cold model cannot cause one to be loaded on the pipeline's account.

## 2. Define the provider in the harness config

`~/.config/opencode/opencode.json` — read the key from the environment, so the
config file itself carries no secret:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local endpoint",
      "options": {
        "baseURL": "https://your-endpoint/v1",
        "apiKey": "{env:GRAPH_MEMORY_LOCAL_API_KEY}",
        "timeout": 900000
      },
      "models": { "your-model-alias": { "name": "Your model" } }
    }
  }
}
```

Local models are slower than hosted ones — raise the provider `timeout` and the
pipeline's own worker timeout together, or long jobs will be killed mid-write.

## 3. Give the pipeline its credentials

Create `${graphRoot}/.env` (default `~/.graph-memory/.env`):

```bash
GRAPH_MEMORY_LOCAL_API_KEY=<the key from step 1>
```

Worker subprocesses are launched with this file overlaid on the daemon's
environment, and its values **win** over the ambient environment — so the
pipeline authenticates as itself even when the shell that started the daemon
exports a different key for the same variable. It is added to the graph root's
`.gitignore` automatically the first time it is read (the graph root is a git
repo). Restrict it: `chmod 600 ~/.graph-memory/.env`.

In Docker mode, `bin/docker-start.sh` mounts the file **read-only** into the
container: workers read it but cannot change it. One that could would point the
next worker's provider, and the key it sends, at an endpoint of its choosing. For
the same reason the start script creates the file empty (mode 600) when it is
absent, so a worker cannot create it either. Restart the daemon after editing it
(`bin/docker-stop.sh && bin/docker-start.sh`). In manual mode workers run as you,
with your access, and nothing contains them.

## 4. Point the pipeline at it

```bash
cogni-code configure-runtime --mode manual --worker opencode \
  --worker-model local/your-model-alias --fallback codex
```

`--worker-model` is passed to `opencode run --model` verbatim, so it must be the
fully-qualified `provider/model` id. Keep a hosted `fallbackProvider` configured:
when the local box is asleep, unreachable, or mid-restart, the daemon retries the
job on the fallback instead of losing it.

Restart the daemon afterwards so it reloads the runtime config.

## Choosing a model without overloading the host

The cheapest correct choice is a model the host is **already serving**. Pointing
the pipeline at a running backend adds no weight memory at all — several aliases
frequently front one process, and selecting a different alias of the same backend
costs nothing. Selecting a model that is not currently loaded costs its full
weights on top of everything else the box is running.

An advertised model is not a resident one. Gateways list aliases from their
config, so `/v1/models` will happily return a model whose backend process is
down; check liveness at the host, not at the gateway.

If nothing suitable is resident, do the arithmetic before choosing: weights at
their quantization, plus KV cache for the context length the model will be served
with, against the host's *available* memory rather than its total. A host already
into swap has less headroom than its free-memory figure suggests.

Then check concurrency separately from capacity. `llama.cpp` defaults to
`--parallel 1`: one slot, every client serialized. Where other workloads share
that backend, pipeline jobs queue behind them, and the symptom is a worker
timeout rather than an out-of-memory error. Raising the slot count is not free —
the KV allocation is split across slots or grown to cover them — so treat it as a
change to the shared backend's budget, not a pipeline setting.

Worker timeouts per stage are set in `pipeline/daemon.ts`; the observer's is the
tightest at 5 minutes and it is the stage that carries the most value, so it is
the first place a saturated local lane shows up.

## Notes

- **Network reachability is the usual failure.** In Docker mode the worker runs
  inside a container, which does not inherit the host's VPN or tailnet routes. If
  the endpoint is only reachable over such a network, run the daemon in manual
  mode or expose the endpoint on an address the container can reach.
- **Tool-calling quality decides whether this works at all.** The pipeline prompts
  require multi-step file reads and writes. A model that is weak at tool use will
  exit 0 having written nothing; the daemon then reports a completed job with no
  graph change. Check `~/.graph-memory/.pipeline-logs/` after the first few runs.
- **`bin/docker-opencode-import-host-auth.sh`** carries the host's `provider`
  block into the container and uses the configured `workerModel` verbatim, so a
  local provider survives the import. It writes a fresh container config rather
  than copying the host's config directory, so host MCP servers, plugins, and
  anything else kept there stay on the host.
