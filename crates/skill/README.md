# skill

A Rust library for packing, unpacking, parsing, and validating AI agent skill packages in `.skill` (zip) format.

## Features

- **Pack/Unpack**: Convert skill directories to `.skill` files and vice versa
- **Parse**: Extract skill metadata and content from `.skill`, `.zip`, directories, or standalone `SKILL.md` files
- **Validate**: Check skill packages for correctness and compliance
- **Structure Detection**: Automatically detect and catalog `scripts/`, `references/`, and `assets/` directories

## Usage

Add this to your `Cargo.toml`:

```toml
[dependencies]
skill = { path = "../skill" }
```

### Packing a Skill

```rust
use skill::package::pack;
use std::path::Path;

pack(
    Path::new("/path/to/skill-directory"),
    Path::new("/output/my-skill.skill")
).unwrap();
```

### Unpacking a Skill

```rust
use skill::package::unpack;
use std::path::Path;

unpack(
    Path::new("/path/to/my-skill.skill"),
    Path::new("/output/extracted")
).unwrap();
```

### Parsing a Skill

```rust
use skill::parser::parse;
use std::path::Path;

// Auto-detect format (directory, .skill, .zip, or .md)
let skill = parse(Path::new("/path/to/skill")).unwrap();

println!("Name: {}", skill.name);
println!("Description: {}", skill.description);
println!("Scripts: {:?}", skill.scripts);
println!("References: {:?}", skill.references);
```

### Validating a Skill

```rust
use skill::validator::validate;
use std::path::Path;

let errors = validate(Path::new("/path/to/skill"));
if errors.is_empty() {
    println!("Skill is valid!");
} else {
    for error in errors {
        println!("Error: {}", error);
    }
}
```

## Skill Directory Structure

A skill directory should follow this structure:

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
└── assets/           # Optional: templates, resources
```

### SKILL.md Format

```markdown
---
name: my-skill
description: What this skill does
license: MIT
allowed-tools: read,write
compatibility: claude-code >= 1.0
---

# Instructions

Detailed instructions for the AI agent...
```

## Packing Exclusions

The following files and directories are automatically excluded when packing:

- `__pycache__`, `node_modules`, `.git`, `.svn`, `.hg`
- `*.pyc`, `*.pyo`, `*.class`, `*.o`, `*.obj`
- `.DS_Store`, `Thumbs.db`, `desktop.ini`
- `evals/`, `tests/`, `test/` (at skill root only)

## License

MIT
