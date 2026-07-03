from __future__ import annotations

from assay_api.exam_packs import get_exam_pack, list_exam_pack_summaries


def test_guardrail_pack_is_registered() -> None:
    pack = get_exam_pack("guardrail-v1")

    assert pack.id == "guardrail-v1"
    assert pack.items[0].scenario is not None
    assert any(summary["id"] == "guardrail-v1" for summary in list_exam_pack_summaries())
