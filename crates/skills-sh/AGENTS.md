# SKILLS-SH CRATE KNOWLEDGE BASE

**Crate**: `skills-sh` — HTTP client for the skills.sh registry\
**Used by**: `aghub-api` (market search endpoint), `aghub-core` (skill install from registry)

## STRUCTURE

```
crates/skills-sh/src/
├── lib.rs      # Public exports: Client, ClientBuilder, SearchParams, SearchResponse
├── client.rs   # Client, ClientBuilder — reqwest-based HTTP client
└── types.rs    # SearchParams, SearchResponse, SearchResult, Skill (DTOs)
```

## WHERE TO LOOK

| Task            | File                                 |
| --------------- | ------------------------------------ |
| Search skills   | `src/client.rs` — `Client::search()` |
| Response types  | `src/types.rs`                       |
| Custom base URL | `ClientBuilder::base_url()`          |

## USAGE

```rust
let client = ClientBuilder::new().build()?;
let results = client.search(SearchParams { query: "my-skill".into(), ..Default::default() }).await?;
```

Override API URL via `SKILLS_API_URL` env var (set on `ClientBuilder` or via env at startup).

## ANTI-PATTERNS

- NEVER call the skills.sh API directly — always go through `Client`
- NEVER hardcode the base URL — use `SKILLS_API_URL` env override for testing
