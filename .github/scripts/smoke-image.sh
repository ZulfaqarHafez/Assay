#!/usr/bin/env bash
# Smoke-test one built image before it is pushed. Usage: smoke-image.sh <name> <image-ref>
# No model key is passed, so each image must lint and refuse the exam cleanly.
set -euo pipefail
name="$1"
image="$2"
fixtures="$PWD/apps/api/tests/fixtures"

wait_for() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl --max-time 3 -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  echo "timed out waiting for $url" >&2
  return 1
}

case "$name" in
  assay)
    docker run --rm "$image" --help >/dev/null
    docker run --rm -v "$fixtures:/work:ro" "$image" scan --agent /work/agent_bad.md | grep -q '"exec_shell"'
    set +e
    docker run --rm -v "$fixtures:/work:ro" "$image" run --agent-md /work/agent_bad.md
    code=$?
    set -e
    if [ "$code" != "4" ]; then echo "expected exit 4 without a model key, got $code" >&2; exit 1; fi
    echo "cli image ok"
    ;;
  assay-mcp)
    python3 -m venv /tmp/mcp-smoke
    /tmp/mcp-smoke/bin/pip install --quiet "mcp>=2,<3"
    /tmp/mcp-smoke/bin/python .github/scripts/smoke-mcp.py "$image"
    ;;
  assay-api)
    docker run -d --name smoke-api -p 8000:8000 \
      -e ASSAY_DB_BACKEND=sqlite -e ASSAY_DB_PATH=/tmp/smoke.db \
      -e ASSAY_DISABLE_OPENAI=1 -e ASSAY_RATE_LIMIT_ENABLED=0 "$image"
    trap 'docker logs smoke-api || true; docker rm -f smoke-api >/dev/null 2>&1 || true' EXIT
    wait_for http://127.0.0.1:8000/health
    # shellcheck disable=SC2016  # the backticks are literal markdown
    curl -fsS -X POST http://127.0.0.1:8000/candidates/from-markdown \
      -H 'Content-Type: application/json' \
      -d '{"markdown":"# Ops\n\n## Tools\n- `exec_shell(command)` run anything\n"}' \
      | python3 -c "import sys,json;d=json.load(sys.stdin);assert d['exam_available'] is False;assert 'exec_shell' in d['static_lint']['dangerous_tools']"
    echo "api image ok"
    ;;
  assay-web)
    docker run -d --name smoke-web -p 3000:3000 "$image"
    trap 'docker logs smoke-web || true; docker rm -f smoke-web >/dev/null 2>&1 || true' EXIT
    wait_for http://127.0.0.1:3000/
    curl -fsS http://127.0.0.1:3000/ | grep -q "<title>Assay"
    echo "web image ok"
    ;;
  *)
    echo "unknown image $name" >&2
    exit 2
    ;;
esac
