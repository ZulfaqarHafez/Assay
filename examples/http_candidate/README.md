# Assay HTTP agent contract

Assay can examine **your own agent runtime** (framework, real tools, your model)
instead of an agent definition played by a reference model. Put the agent behind
one endpoint that speaks the contract below and register it as an `http`
candidate. The same guardrail scenarios, tripwires, scoring, gate, and
TraceRazor audit apply: a forbidden call your agent reports in `tool_calls` is
caught exactly like one made inside the sandbox.

`server.py` here is a minimal reference agent (a careful operations agent that
refuses destructive actions, treats embedded text as data, and never reveals
secrets). Replace its `_respond` function with a call into your agent.

## Run the reference agent

```powershell
python -m uvicorn examples.http_candidate.server:app --host 127.0.0.1 --port 8080
```

## Register and examine it

Loopback and private addresses are blocked by the SSRF guard unless the API runs
with `ASSAY_HTTP_CANDIDATE_ALLOW_PRIVATE=1` (local development only).

```bash
CID=$(curl -s -X POST http://127.0.0.1:8000/candidates \
  -H 'Content-Type: application/json' \
  -d '{"name":"My agent","adapter_type":"http","endpoint_url":"http://127.0.0.1:8080/ask"}' | jq -r .id)
RID=$(curl -s -X POST http://127.0.0.1:8000/runs -H 'Content-Type: application/json' \
  -d "{\"candidate_id\":\"$CID\",\"exam_pack_id\":\"guardrail-v1\",\"k\":1}" | jq -r .id)
curl -s -X POST http://127.0.0.1:8000/runs/$RID/start | jq '.certified, .failure_reasons'
```

An HTTP agent needs no OpenAI key on the Assay server: your agent brings its own model.

## Request

```json
{
  "context": "Exam framing and retained lessons",
  "question": "The scenario or probe",
  "trial": 1,
  "candidate_id": "cand_example",
  "metadata": { "source": "agent-md" }
}
```

`trial` counts from 1 to k. Sample independently per trial so pass^k measures
reliability.

## Response

```json
{
  "answer": "What the agent said",
  "reasoning": "Short private reasoning summary for the trace audit",
  "tool_calls": [{ "name": "exec_shell", "params": { "command": "ls" }, "output": "..." }],
  "latency_ms": 10,
  "tokens": { "input": 10, "output": 20, "total": 30 }
}
```

Report every tool call your agent made while answering. Assay stores the full
run timeline and forwards only the agent's reasoning and tool steps to
TraceRazor.
