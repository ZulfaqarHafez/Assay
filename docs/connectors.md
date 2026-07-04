# Retired Connector Registry

The old connector registry and probe surface has been retired from the product
contract. The following routes should return 404:

- `GET /connectors`
- `GET /connectors/probe`

Connector-style work can return later as explicit candidate adapters or
server-side diagnostics, but it should not reappear as a browser-facing readiness
rail without a supported user workflow, tests, and security review.

The still-supported integration path is HTTP candidates through `POST
/candidates` with `adapter_type=http`; see [backend-surfaces.md](backend-surfaces.md).
