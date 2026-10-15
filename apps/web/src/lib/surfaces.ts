/**
 * The six ways to run Assay, with byte-exact commands (no shell prompt, so a
 * copy pastes clean). Package names and tags match .github/workflows/publish.yml
 * and the v0.1.0 GitHub Release.
 */

export const REPO_URL = "https://github.com/ZulfaqarHafez/Assay";
export const PACKAGES_URL = "https://github.com/ZulfaqarHafez?tab=packages&repo_name=Assay";
export const RELEASE_URL = `${REPO_URL}/releases/tag/v0.1.0`;
export const WHEEL_URL = `${REPO_URL}/releases/download/v0.1.0/assay-0.1.0-py3-none-any.whl`;
export const MCP_DOCS_URL = `${REPO_URL}/blob/main/docs/mcp.md`;
export const ACTION_URL = `${REPO_URL}/tree/main/.github/actions/assay`;
export const HTTP_CONTRACT_URL = `${REPO_URL}/blob/main/examples/http_candidate/README.md`;

export type Surface = {
  id: string;
  name: string;
  /** What this surface is for, one line. */
  use: string;
  /** Does the command below need a model key to do its job? */
  key: "none" | "exam";
  command: string;
  language: "bash" | "python" | "json" | "yaml";
  docs?: { label: string; href: string };
};

export const SURFACES: Surface[] = [
  {
    id: "cli",
    name: "CLI",
    use: "Lint without a key; gate a pipeline on the verdict with exit codes.",
    key: "exam",
    language: "bash",
    command:
      'docker run --rm -v "$PWD:/work" -e OPENAI_API_KEY ghcr.io/zulfaqarhafez/assay run --agent-md /work/AGENTS.md --pack guardrail-v1',
    docs: { label: "ghcr.io/zulfaqarhafez/assay", href: PACKAGES_URL }
  },
  {
    id: "mcp",
    name: "MCP server",
    use: "Let Claude Code, Claude Desktop or Cursor lint and exam the AGENTS.md it is writing.",
    key: "exam",
    language: "json",
    command: `{
  "mcpServers": {
    "assay": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "OPENAI_API_KEY", "-v", "assay-data:/data",
               "ghcr.io/zulfaqarhafez/assay-mcp:latest"],
      "env": { "OPENAI_API_KEY": "\${OPENAI_API_KEY}" }
    }
  }
}`,
    docs: { label: "docs/mcp.md", href: MCP_DOCS_URL }
  },
  {
    id: "sdk",
    name: "Python SDK",
    use: "Call the engine from a test suite or a script.",
    key: "exam",
    language: "python",
    command: `from assay_api import sdk

text = open("AGENTS.md").read()
report = sdk.lint_agent(text, filename="AGENTS.md")        # no key needed
result = sdk.run_exam(text, "AGENTS.md", pack="guardrail-v1", k=1)
print(result["exercised_model"], result["verdict"])
for breach in result["breaches"]:
    print(breach["tripwire"], breach["tool_call"])`,
    docs: { label: "wheel on the v0.1.0 release", href: RELEASE_URL }
  },
  {
    id: "action",
    name: "GitHub Action",
    use: "Fail the build before an agent whose guardrails do not hold ships.",
    key: "exam",
    language: "yaml",
    command: `- uses: ZulfaqarHafez/Assay/.github/actions/assay@main
  with:
    agent-md: AGENTS.md
    pack: guardrail-v1
    pass-threshold: "0.8"
    openai-api-key: \${{ secrets.OPENAI_API_KEY }}`,
    docs: { label: ".github/actions/assay", href: ACTION_URL }
  },
  {
    id: "api",
    name: "HTTP API",
    use: "Register a candidate, start a run, stream the judging, fetch the proof bundle.",
    key: "exam",
    language: "bash",
    command:
      "docker run -p 8000:8000 -e OPENAI_API_KEY -e ASSAY_CORS_ORIGINS=http://localhost:3000 ghcr.io/zulfaqarhafez/assay-api",
    docs: { label: "ghcr.io/zulfaqarhafez/assay-api", href: PACKAGES_URL }
  },
  {
    id: "http-agent",
    name: "Your own agent",
    use: "Exam a deployed agent instead of a definition: one POST endpoint, no key needed.",
    key: "none",
    language: "bash",
    command: `curl -X POST http://localhost:8000/candidates -H "content-type: application/json" -d '{
  "name": "ops-helper", "adapter_type": "http",
  "endpoint_url": "https://agent.example.com/ask"
}'`,
    docs: { label: "HTTP contract", href: HTTP_CONTRACT_URL }
  }
];

export const INSTALL_ONE_LINER = 'docker run --rm -v "$PWD:/work" ghcr.io/zulfaqarhafez/assay scan --agent /work/AGENTS.md';

export const PIP_INSTALL = `pip install "assay[mcp] @ ${WHEEL_URL}"`;

/** What each surface does with no model key. Copied from the product's real behaviour. */
export const NO_KEY_BEHAVIOUR: Array<{ surface: string; behaviour: string }> = [
  { surface: "Web", behaviour: "lints the definition, says the exam needs a key, starts no run" },
  { surface: "CLI", behaviour: "scan, improve, gate and doctor work; run exits 4 and writes no verdict" },
  { surface: "HTTP API", behaviour: "POST /runs returns 409 with the reason" },
  { surface: "SDK", behaviour: "run_exam raises ModelUnavailableError before recording anything" },
  { surface: "MCP", behaviour: "assay_run_exam returns an error with setup steps; assay_doctor says why" },
  { surface: "Your own agent", behaviour: "no key involved: your endpoint answers every probe" }
];

/** CLI exit codes, verbatim from assay_api/cli.py. */
export const EXIT_CODES: Array<{ code: number; meaning: string }> = [
  { code: 0, meaning: "ship" },
  { code: 1, meaning: "gate failed (probation or do not ship)" },
  { code: 2, meaning: "runtime error" },
  { code: 3, meaning: "invalid input" },
  { code: 4, meaning: "no verdict: no model key, the exam did not run" }
];
