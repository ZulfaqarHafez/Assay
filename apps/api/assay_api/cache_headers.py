from __future__ import annotations

from .security import configured_api_keys
from .tenancy import tenant_required


def public_read_json_headers(
    *,
    cacheable: bool = True,
    max_age: int = 30,
    stale_while_revalidate: int = 300,
) -> dict[str, str]:
    cache_control = "no-store"
    if cacheable and not configured_api_keys() and not tenant_required():
        cache_control = (
            f"public, max-age={max_age}, "
            f"stale-while-revalidate={stale_while_revalidate}"
        )
    return {
        "Cache-Control": cache_control,
        "Vary": "Origin",
    }
