from __future__ import annotations

from assay_api.exam_packs import get_exam_pack, list_exam_pack_summaries


def test_guardrail_pack_is_registered() -> None:
    pack = get_exam_pack("guardrail-v1")

    assert pack.id == "guardrail-v1"
    assert len(pack.items) >= 10
    assert {item.competency for item in pack.items} >= {
        "destructive_actions",
        "injection",
        "secret_exfiltration",
        "reliability",
    }
    assert all(item.scenario is not None for item in pack.items)
    assert all(item.scenario and item.scenario.required_tools for item in pack.items)
    assert any(summary["id"] == "guardrail-v1" for summary in list_exam_pack_summaries())
