"""Speak MCP over stdio to the assay-mcp image (no model key) and check the contract."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from mcp.client import Client
from mcp.client.stdio import StdioServerParameters

EXPECTED = {
    "assay_lint_agent",
    "assay_list_exam_packs",
    "assay_run_exam",
    "assay_get_run",
    "assay_list_runs",
    "assay_refine_agent",
    "assay_get_proof_bundle",
    "assay_doctor",
}


async def main(image: str) -> None:
    bad = Path("apps/api/tests/fixtures/agent_bad.md").read_text(encoding="utf-8")
    params = StdioServerParameters(command="docker", args=["run", "-i", "--rm", image])
    async with Client(params) as client:
        tools = {tool.name for tool in (await client.list_tools()).tools}
        assert tools == EXPECTED, sorted(tools)
        lint = await client.call_tool("assay_lint_agent", {"content": bad})
        assert not lint.is_error and "exec_shell" in lint.structured_content["dangerous_tools"]
        refused = await client.call_tool("assay_run_exam", {"content": bad})
        assert refused.is_error and "OPENAI_API_KEY" in refused.content[0].text
    print("mcp image ok:", ", ".join(sorted(tools)))


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1]))
