from __future__ import annotations

import json

from assay_api.agent_formats import detect_format, normalize_agent_definition
from assay_api.agent_intake import detect_agent_facts

OPENAI_ASSISTANT = json.dumps(
    {
        "name": "Support Sentinel",
        "model": "gpt-4.1",
        "instructions": "Answer support tickets. Never reveal internal notes.",
        "tools": [
            {"type": "function", "function": {"name": "lookup_order"}},
            {"type": "function", "function": {"name": "issue_refund"}},
            {"type": "code_interpreter"},
        ],
    }
)

GENERIC_AGENT_JSON = json.dumps(
    {
        "title": "Billing Bot",
        "system_prompt": "Handle billing questions within policy.",
        "tools": ["stripe_lookup", "escalate"],
    }
)

CREWAI_YAML = """
agents:
  triage_specialist:
    role: Ticket Triage Specialist
    goal: Route each ticket to the right queue without leaking customer data.
    backstory: A careful operator who values policy over speed.
    tools:
      - route_ticket
      - redact_pii
"""

TOML_AGENT = """
name = "Ops Runner"
instructions = "Run ops checklists and never mutate state without approval."
tools = ["run_checklist", "page_oncall"]
"""

FRONTMATTER_MD = """---
name: Careful Concierge
tools:
  - book_room
  - cancel_booking
---
Greets guests and manages bookings while protecting payment details.
"""


def test_detect_format_by_extension_and_sniffing() -> None:
    assert detect_format("# Agent", "agent.md") == "markdown"
    assert detect_format(OPENAI_ASSISTANT, "assistant.json") == "json"
    assert detect_format(CREWAI_YAML, "crew.yaml") == "yaml"
    assert detect_format(TOML_AGENT, "agent.toml") == "toml"
    # No filename: content sniffing.
    assert detect_format(OPENAI_ASSISTANT) == "json"
    assert detect_format(CREWAI_YAML) == "yaml"
    assert detect_format(TOML_AGENT) == "toml"
    assert detect_format(FRONTMATTER_MD) == "frontmatter-markdown"
    assert detect_format("# Just markdown\n\nWith prose.") == "markdown"
    # Declared format wins over extension.
    assert detect_format(OPENAI_ASSISTANT, "assistant.txt", declared="json") == "json"


def test_openai_assistant_json_normalizes_to_parseable_markdown() -> None:
    normalized = normalize_agent_definition(OPENAI_ASSISTANT, filename="assistant.json")

    assert normalized.format == "json"
    facts = detect_agent_facts(normalized.markdown)
    assert facts["title"] == "Support Sentinel"
    assert "lookup_order" in facts["tools"]
    assert "issue_refund" in facts["tools"]
    assert "Never reveal internal notes." in normalized.markdown
    assert normalized.facts_overrides["tool_count"] == 3


def test_generic_agent_json_uses_title_and_system_prompt() -> None:
    normalized = normalize_agent_definition(GENERIC_AGENT_JSON, filename="agent.json")

    facts = detect_agent_facts(normalized.markdown)
    assert facts["title"] == "Billing Bot"
    assert facts["tools"] == ["stripe_lookup", "escalate"]


def test_crewai_yaml_nested_agents_map() -> None:
    normalized = normalize_agent_definition(CREWAI_YAML, filename="crew.yaml")

    assert normalized.format == "yaml"
    facts = detect_agent_facts(normalized.markdown)
    # The nested agent's role is the human title; goal/backstory land in the body.
    assert facts["title"] in ("Ticket Triage Specialist", "triage_specialist")
    assert "route_ticket" in facts["tools"]
    assert "redact_pii" in facts["tools"]
    assert "policy over speed" in normalized.markdown


def test_toml_agent_normalizes() -> None:
    normalized = normalize_agent_definition(TOML_AGENT, filename="agent.toml")

    assert normalized.format == "toml"
    facts = detect_agent_facts(normalized.markdown)
    assert facts["title"] == "Ops Runner"
    assert facts["tools"] == ["run_checklist", "page_oncall"]


def test_frontmatter_markdown_keeps_body_and_lifts_meta() -> None:
    normalized = normalize_agent_definition(FRONTMATTER_MD, filename="agent.md")

    assert normalized.format == "frontmatter-markdown"
    facts = detect_agent_facts(normalized.markdown)
    assert facts["title"] == "Careful Concierge"
    assert "book_room" in facts["tools"]
    assert "protecting payment details" in normalized.markdown
    # The raw frontmatter fence never reaches the canonical markdown.
    assert not normalized.markdown.startswith("---")


def test_plain_markdown_passes_through_unchanged() -> None:
    source = "# Plain Agent\n\nDo the work.\n\n## Tools\n- `hammer`\n"
    normalized = normalize_agent_definition(source, filename="agent.md")

    assert normalized.format == "markdown"
    assert normalized.markdown == source
    assert normalized.facts_overrides == {}


def test_malformed_json_falls_back_to_text() -> None:
    normalized = normalize_agent_definition("{not valid json", filename="agent.json")

    assert normalized.format == "text"
    assert normalized.markdown == "{not valid json"
