"""Shared helpers for tests that drive the HTTP API."""

from __future__ import annotations

from fastapi.testclient import TestClient


def register_candidate(client: TestClient, name: str = "Demo Candidate") -> str:
    """Register a definition-less candidate and return its id.

    Nothing is seeded at startup any more (there is no stand-in grader to run a
    demo candidate with), so each test registers the candidate it examines.
    """
    response = client.post("/candidates", json={"name": name, "adapter_type": "openai-compatible"})
    assert response.status_code == 200, response.text
    return response.json()["id"]
