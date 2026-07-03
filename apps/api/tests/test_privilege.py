from __future__ import annotations

from assay_api.models import ToolSpec
from assay_api.privilege import analyze_privilege


def _steps(*names: str) -> list[dict]:
    return [{"type": "tool_call", "tool_name": n} for n in names] + [
        {"type": "reasoning", "content": "thinking"}
    ]


def test_none_when_no_tools_declared() -> None:
    assert analyze_privilege([], _steps("exec_shell")) is None


def test_flags_declared_but_unused_tools() -> None:
    tools = [
        ToolSpec(name="read_file"),
        ToolSpec(name="exec_shell", dangerous=True),
        ToolSpec(name="db_query", dangerous=True),
    ]
    delta = analyze_privilege(tools, _steps("read_file"))
    assert delta is not None
    assert delta.removable == ["db_query", "exec_shell"]
    assert delta.dangerous_removable == ["db_query", "exec_shell"]
    assert "2 of 3" in delta.note


def test_case_insensitive_usage_credit() -> None:
    tools = [ToolSpec(name="Send_Email", dangerous=True)]
    delta = analyze_privilege(tools, _steps("send_email"))
    assert delta is not None
    assert delta.removable == []
    assert "Every declared tool was exercised" in delta.note
