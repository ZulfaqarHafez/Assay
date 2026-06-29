from __future__ import annotations

from assay_api.tool_parser import parse_tools

TOOLS_PY = '''
def lookup_account(email: str, include_notes: bool = False) -> dict:
    """Look up a customer account by email.

    Returns the account record.
    """
    ...

def issue_refund(amount: float, reason: str):
    "Issue a refund to the customer."
    ...

def delete_user(user_id: int):
    """Permanently delete a user."""
    ...

def _private_helper(x):
    return x
'''


def test_parses_python_signatures_and_docstrings() -> None:
    specs = {s.name: s for s in parse_tools(TOOLS_PY, "python")}

    # Private helpers are not tools.
    assert set(specs) == {"lookup_account", "issue_refund", "delete_user"}

    lookup = specs["lookup_account"]
    assert lookup.description.startswith("Look up a customer account")
    assert lookup.parameters["properties"]["email"]["type"] == "string"
    assert lookup.parameters["properties"]["include_notes"]["type"] == "boolean"
    # email is required (no default); include_notes has a default so it isn't.
    assert lookup.parameters["required"] == ["email"]
    assert "email: str" in lookup.signature

    refund = specs["issue_refund"]
    assert refund.parameters["properties"]["amount"]["type"] == "number"
    assert set(refund.parameters["required"]) == {"amount", "reason"}


def test_flags_dangerous_tools() -> None:
    specs = {s.name: s for s in parse_tools(TOOLS_PY, "python")}
    assert specs["delete_user"].dangerous is True
    assert specs["lookup_account"].dangerous is False


def test_bad_python_degrades_to_empty() -> None:
    assert parse_tools("def oops(:\n  pass", "python") == []
    assert parse_tools("", "python") == []
    assert parse_tools(None, "python") == []


def test_parses_openai_json_schema() -> None:
    schema = """
    [
      {"type": "function", "name": "search", "description": "Search the web",
       "parameters": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}},
      {"function": {"name": "wipe_db", "description": "Drop all tables", "parameters": {"type": "object", "properties": {}}}}
    ]
    """
    specs = {s.name: s for s in parse_tools(schema, "json-schema")}
    assert set(specs) == {"search", "wipe_db"}
    assert specs["search"].parameters["required"] == ["q"]
    assert specs["wipe_db"].dangerous is True  # "wipe"/"Drop" hints
    # Round-trips to an OpenAI tool shape.
    tool = specs["search"].to_openai_tool()
    assert tool["type"] == "function" and tool["name"] == "search"


def test_intake_persists_parsed_tools_on_candidate() -> None:
    from fastapi.testclient import TestClient
    from assay_api.main import app

    with TestClient(app) as client:
        resp = client.post(
            "/candidates/from-markdown",
            json={"markdown": "# Support Agent\nHandle tickets.", "tools_code": TOOLS_PY, "tools_format": "python"},
        ).json()

    detected = resp["detected"]
    assert set(detected["tools"]) == {"lookup_account", "issue_refund", "delete_user"}
    assert detected["tool_count"] == 3
    # The candidate carries the structured specs (for function-calling later).
    cand_tools = {t["name"]: t for t in resp["candidate"]["tools"]}
    assert cand_tools["delete_user"]["dangerous"] is True
    assert cand_tools["lookup_account"]["parameters"]["properties"]["email"]["type"] == "string"
