"""FastAPI sub-routers, one module per product surface.

Splitting the route handlers out of ``main.py`` keeps each product's API in its
own file (health, suites, candidates/agents, runs, role intelligence,
connectors) while ``main.py`` stays focused on app construction, middleware, and
lifecycle. ``main.py`` mounts every router via ``include_router``.
"""

from . import candidates, connectors, health, role, runs, suites

__all__ = ["candidates", "connectors", "health", "role", "runs", "suites"]
