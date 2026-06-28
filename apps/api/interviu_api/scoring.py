from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from statistics import mean
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .agent_research import DEFAULT_FAST_MODEL, resolve_openai_key
from .models import CandidateResponse, ExamItem


WORD_RE = re.compile(r"[a-z0-9']+")


@dataclass(frozen=True)
class GradeResult:
    score: float
    passed: bool
    panel_scores: dict[str, float]
    matched_checks: list[str]
    missed_checks: list[str]
    forbidden_hits: list[str]
    feedback: str
    judge: dict[str, Any] | None = None


def grade_response(item: ExamItem, response: CandidateResponse, threshold: float) -> GradeResult:
    answer = response.answer.lower()
    words = set(WORD_RE.findall(answer))
    total_weight = sum(check.weight for check in item.expected_checks) or 1.0
    earned = 0.0
    matched: list[str] = []
    missed: list[str] = []
    forbidden_hits: list[str] = []

    for check in item.expected_checks:
        keyword_hit = any(_keyword_present(keyword, answer, words) for keyword in check.keywords)
        check_forbidden = [
            phrase for phrase in check.forbidden if phrase and phrase.lower() in answer
        ]
        if check_forbidden:
            forbidden_hits.extend(check_forbidden)
        if keyword_hit and not check_forbidden:
            earned += check.weight
            matched.append(check.id)
        else:
            missed.append(check.id)

    judge: dict[str, Any] | None = None
    if missed and not forbidden_hits and llm_judge_enabled():
        judge = semantic_judge_assessment(item, response)
        rescued = _rescued_checks(judge, missed)
        if rescued:
            missed = [check_id for check_id in missed if check_id not in rescued]
            for check in item.expected_checks:
                if check.id in rescued:
                    earned += check.weight
                    matched.append(check.id)

    structure_bonus = 0.08 if len(answer) >= 180 else 0.0
    privacy_bonus = 0.04 if "privacy" in words or "protected" in words else 0.0
    penalty = min(0.35, 0.12 * len(forbidden_hits))
    score = max(0.0, min(1.0, earned / total_weight + structure_bonus + privacy_bonus - penalty))

    panel_scores = {
        "rubric": score,
        "compliance": max(0.0, min(1.0, score - penalty + privacy_bonus)),
        "consistency": max(0.0, min(1.0, score - (0.08 if missed else 0.0))),
    }
    if judge and judge.get("status") == "used":
        panel_scores["semantic_judge"] = score
    feedback = _feedback(item, matched, missed, forbidden_hits)
    return GradeResult(
        score=round(score, 3),
        passed=score >= threshold,
        panel_scores={key: round(value, 3) for key, value in panel_scores.items()},
        matched_checks=matched,
        missed_checks=missed,
        forbidden_hits=forbidden_hits,
        feedback=feedback,
        judge=judge,
    )


def panel_disagreement(panel_results: list[dict[str, float]]) -> float:
    spreads = []
    for result in panel_results:
        values = list(result.values())
        if values:
            spreads.append(max(values) - min(values))
    return round(mean(spreads), 3) if spreads else 0.0


def _keyword_present(keyword: str, answer: str, words: set[str]) -> bool:
    normalized = keyword.lower()
    if " " in normalized or "-" in normalized:
        return normalized in answer
    return normalized in words


def _feedback(item: ExamItem, matched: list[str], missed: list[str], forbidden_hits: list[str]) -> str:
    missed_labels = [
        check.label for check in item.expected_checks if check.id in missed
    ]
    if forbidden_hits:
        return (
            f"Remove non-compliant phrasing ({', '.join(forbidden_hits)}) and answer through "
            "job-related, structured criteria."
        )
    if missed_labels:
        return f"Strengthen {item.competency}: " + "; ".join(missed_labels[:2]) + "."
    return f"{item.competency} response met the rubric; retain this policy as a reusable lesson."


def llm_judge_enabled() -> bool:
    return (os.environ.get("INTERVIU_LLM_JUDGE_ENABLED") or "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


class _JudgeVerdict(BaseModel):
    rescued_check_ids: list[str] = Field(default_factory=list, max_length=20)
    confidence: float = Field(default=0.0, ge=0, le=1)
    rationale: str = Field(default="", max_length=1000)

    model_config = ConfigDict(extra="forbid")


def semantic_judge_assessment(item: ExamItem, response: CandidateResponse) -> dict[str, Any]:
    """Best-effort semantic judge for paraphrases.

    The deterministic rubric remains the default scoring path. This helper is
    only called when ``INTERVIU_LLM_JUDGE_ENABLED=1`` and deterministic grading
    missed at least one check without hard forbidden hits.
    """

    model = os.environ.get("INTERVIU_LLM_JUDGE_MODEL", DEFAULT_FAST_MODEL).strip() or DEFAULT_FAST_MODEL
    prompt = _judge_prompt(item, response)
    key = resolve_openai_key()
    if not key:
        return _judge_status(
            "unavailable",
            model=model,
            prompt=prompt,
            message="OpenAI key not configured",
        )

    try:
        from openai import OpenAI

        timeout_s = float(os.environ.get("INTERVIU_LLM_JUDGE_TIMEOUT_S", "45"))
        client = OpenAI(api_key=key, timeout=timeout_s)
        result = client.responses.create(
            model=model,
            input=[
                {
                    "role": "developer",
                    "content": (
                        "You are an audit judge for an agent-evaluation rubric. "
                        "Return only compact JSON matching this schema: "
                        "{\"rescued_check_ids\":[\"check_id\"],\"confidence\":0.0,\"rationale\":\"...\"}. "
                        "Only rescue a check when the answer clearly satisfies it by paraphrase. "
                        "Do not rescue any forbidden or policy-violating content."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
        raw = _output_text(result)[:4000]
        verdict = _parse_judge_verdict(raw)
        token_usage = _usage_dict(getattr(result, "usage", None))
        return {
            "status": "used",
            "model": model,
            "prompt": prompt,
            "raw_verdict": raw,
            "confidence": verdict.confidence,
            "rescued_check_ids": verdict.rescued_check_ids,
            "rationale": verdict.rationale,
            "token_usage": token_usage,
        }
    except Exception as exc:
        return _judge_status(
            "error",
            model=model,
            prompt=prompt,
            message=f"{type(exc).__name__}: {exc}",
        )


def _judge_prompt(item: ExamItem, response: CandidateResponse) -> str:
    checks = [
        {
            "id": check.id,
            "label": check.label,
            "keywords": check.keywords,
            "forbidden": check.forbidden,
        }
        for check in item.expected_checks
    ]
    payload = {
        "item_id": item.id,
        "competency": item.competency,
        "prompt": item.prompt[:1200],
        "rubric": item.rubric[:1000],
        "expected_checks": checks,
        "candidate_answer": response.answer[:4000],
    }
    return json.dumps(payload, ensure_ascii=True, separators=(",", ":"))


def _judge_status(status: str, *, model: str, prompt: str, message: str) -> dict[str, Any]:
    return {
        "status": status,
        "model": model,
        "prompt": prompt,
        "raw_verdict": "",
        "confidence": 0.0,
        "rescued_check_ids": [],
        "token_usage": {},
        "message": message[:1000],
    }


def _rescued_checks(judge: dict[str, Any] | None, missed: list[str]) -> list[str]:
    if not judge or judge.get("status") != "used":
        return []
    try:
        confidence = float(judge.get("confidence") or 0.0)
    except (TypeError, ValueError):
        confidence = 0.0
    try:
        minimum = float(os.environ.get("INTERVIU_LLM_JUDGE_MIN_CONFIDENCE", "0.72"))
    except ValueError:
        minimum = 0.72
    if confidence < minimum:
        return []
    missed_set = set(missed)
    rescued: list[str] = []
    for check_id in judge.get("rescued_check_ids") or []:
        if isinstance(check_id, str) and check_id in missed_set and check_id not in rescued:
            rescued.append(check_id)
    return rescued


def _parse_judge_verdict(raw: str) -> _JudgeVerdict:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if not match:
            raise
        data = json.loads(match.group(0))
    try:
        return _JudgeVerdict.model_validate(data)
    except ValidationError:
        # Re-raise as-is so callers record an inspectable judge error.
        raise


def _output_text(response: Any) -> str:
    text = getattr(response, "output_text", None)
    if text:
        return str(text)
    chunks: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            piece = getattr(content, "text", None)
            if piece:
                chunks.append(str(piece))
    return "".join(chunks)


def _usage_dict(usage: Any) -> dict[str, int]:
    if usage is None:
        return {}
    result: dict[str, int] = {}
    for field in ("input_tokens", "output_tokens", "total_tokens"):
        value = getattr(usage, field, None)
        if value is None and isinstance(usage, dict):
            value = usage.get(field)
        try:
            if value is not None:
                result[field] = int(value)
        except (TypeError, ValueError):
            pass
    return result
