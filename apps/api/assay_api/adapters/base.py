from __future__ import annotations

from abc import ABC, abstractmethod

from ..models import CandidateResponse


class CandidateAdapterError(RuntimeError):
    """Raised when a candidate adapter cannot complete the ask contract."""


class CandidateAdapter(ABC):
    # True when repeated asks of the same question can legitimately differ
    # (e.g. a live LLM at nonzero temperature), so pass^k measures reliability
    # under resampling. False for deterministic adapters, where k trials are
    # identical and pass^k collapses to a single held-out check.
    stochastic: bool = False

    @abstractmethod
    async def ask(self, context: str, question: str, trial: int = 1) -> CandidateResponse:
        raise NotImplementedError

    async def aclose(self) -> None:
        return None
