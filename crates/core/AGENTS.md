# CORE CRATE KNOWLEDGE BASE

**Crate**: `aghub-core` — Orchestration layer. Re-exports `aghub-agents` and adds adapter dispatch, registry, manager, skills discovery, and batch transfer operations.

> Agent descriptors, models, and format modules live in `crates/agents`. This crate wires them together.

## STRUCTURE

```
crates/core/src/
├── lib.rs          # Re-exports aghub-agents + convert_skill(), format_path_with_tilde()
├── adapter.rs      # Adapter dispatch (agent ID → AgentDescriptor operations)
├── adapters/
│   └── mod.rs      # AgentAdapter trait, create_adapter()
├── all_agents.rs   # load_all_agents() → AgentResources (bulk load across all agents)
├── availability.rs # Agent CLI availability detection (which agents are installed)
├── manager/
│   ├── mod.rs      # ConfigManager — CRUD for MCPs + skills per agent/scope
│   ├── mcp.rs      # MCP-specific manager operations
│   └── skill.rs    # Skill-specific manager operations
├── paths.rs        # XDG-compliant path helpers
├── registry/
│   └── mod.rs      # ALL_AGENTS: &[&'static AgentDescriptor], get() by AgentType
├── skills/
│   └── mod.rs      # SKILL.md discovery + YAML frontmatter parsing
├── transfer.rs     # Batch install/copy/delete across agents: OperationBatchResult
└── testing.rs      # TestConfig, TestConfigBuilder (feature = "testing")
```

## WHERE TO LOOK

| Task                     | Location              | Notes                                    |
| ------------------------ | --------------------- | ---------------------------------------- |
| Agent descriptors/models | `crates/agents/`      | NOT here — core re-exports them          |
| Adapter dispatch         | `src/adapter.rs`      | Maps AgentType → fn calls on descriptor  |
| CRUD for MCPs/skills     | `src/manager/`        | `ConfigManager::new(agent, scope)`       |
| All-agent bulk load      | `src/all_agents.rs`   | `load_all_agents() → AgentResources`     |
| Registry lookup          | `src/registry/mod.rs` | `registry::get(agent_type)` → descriptor |
| Skills from filesystem   | `src/skills/mod.rs`   | Parses SKILL.md YAML frontmatter         |
| Cross-agent batch ops    | `src/transfer.rs`     | `OperationBatchResult`                   |
| XDG paths                | `src/paths.rs`        | `~` prefix convention                    |
| Agent CLI detection      | `src/availability.rs` | Checks for installed agent binaries      |
| Test isolation           | `src/testing.rs`      | `TestConfig` + per-agent path overrides  |

## KEY ABSTRACTIONS

**`ConfigManager`**: Central CRUD — `load()`, `save()`, `load_both()`. Scope: `GlobalOnly | ProjectOnly | Both`.

**`AgentAdapter`** (trait in `adapters/mod.rs`): wraps a descriptor; `create_adapter(agent_type)` returns one.

**`transfer.rs`**: `InstallTarget { agent, scope, project_root }`, `OperationBatchResult { results: Vec<OperationResult> }` — used for installing/copying skills to multiple agents at once.

**Skills discovery**: Walks directories looking for `SKILL.md`; parses YAML frontmatter between `---` markers; records `source_path` with `~` prefix.

## CONVENTIONS

- Agent IDs: `snake_case` in code, `kebab-case` in CLI args
- Paths: `~` prefix for home-relative (converted at I/O boundary)
- Skills deduplication: by name, project takes precedence over global
- MCPs: not deduplicated

## TESTING

```bash
cargo test -p aghub-core                           # All core tests (testing feature on by default)
cargo test -p aghub-core --test integration_tests  # Integration only
cargo test -p aghub-core --features agent-validation  # Tests requiring real CLIs installed
```

`TestConfig` creates isolated temp dirs. Per-agent path overrides via `set_skills_path_override(agent_id, path)` (thread-local).

## ANTI-PATTERNS

- NEVER add agent descriptors here — they belong in `crates/agents/src/agents/`
- NEVER bypass `ConfigManager` for config mutations
- NEVER skip `source_path` on Skill — required for provenance tracking
- NEVER use non-XDG paths — always use `dirs` crate + `paths.rs` helpers
- NEVER add to `registry/mod.rs` without first adding to `crates/agents`
