# GIT CRATE KNOWLEDGE BASE

**Crate**: `aghub-git` — Git clone with credential injection from environment variables\
**Used by**: `aghub-core` (skill install from git URLs)

## STRUCTURE

```
crates/git/src/
├── lib.rs           # Public API: clone_to_temp, clone_to_path, Credentials
├── clone.rs         # CloneOptions builder, clone_to_temp(), clone_to_path()
├── credentials.rs   # read_credentials(), inject_credentials(), Credentials struct
├── remote.rs        # Remote URL manipulation
└── error.rs         # GitError enum (thiserror)
```

## WHERE TO LOOK

| Task               | File                 |
| ------------------ | -------------------- |
| Clone a repo       | `src/clone.rs`       |
| Inject credentials | `src/credentials.rs` |
| URL rewriting      | `src/remote.rs`      |

## USAGE

```rust
// Via environment variables (preferred)
std::env::set_var("GIT_USERNAME", "user");
std::env::set_var("GIT_PASSWORD", "token");
let temp = clone_to_temp(CloneOptions::new("https://github.com/user/repo.git"))?;

// Or explicit credentials
let temp = clone_to_temp(
    CloneOptions::new("https://github.com/user/repo.git")
        .with_credentials("user", "token")
)?;
// temp dir auto-cleaned on drop
```

## ENV VARS

- `GIT_USERNAME` — Git username for auth
- `GIT_PASSWORD` — Git password or personal access token

## DEPENDENCIES

Uses `gix` (pure Rust git). Features: `blocking-network-client`, `worktree-mutation`, `blocking-http-transport-reqwest-native-tls`.

## ANTI-PATTERNS

- NEVER hardcode credentials — always read from env or `CloneOptions.with_credentials()`
- NEVER hold `TempDir` beyond the scope where cloned files are needed (auto-deleted on drop)
