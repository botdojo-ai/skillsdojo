# SkillsDojo CLI

The official command-line interface for [SkillsDojo](https://skillsdojo.ai) - manage AI agent skills from your terminal.

## Installation

```bash
# From the packages/cli directory
npm install
npm run build
npm link

# Or run directly
./bin/sd.js --help
```

## Quick Start

```bash
# Search for public skills
sdojo search "code review"

# Clone a collection to work on locally
sdojo clone anthropic/core-skills

# Make changes, then push as a pull request
cd core-skills
sdojo skill create my-new-skill
sdojo push --title "Add my new skill"
```

## Authentication

### Login

```bash
# Interactive login (opens browser)
sdojo auth login

# Login with email/password (for CI/scripts)
sdojo auth login -u you@example.com -p yourpassword

# Login with API token
sdojo auth login --token
```

### Check Current User

```bash
sdojo auth whoami
```

Output:
```
Logged in as: you@example.com
Account: yourusername (Your Name)
API: https://skillsdojo.ai
```

### Logout

```bash
sdojo auth logout
```

## Working with Collections

### List Your Collections

```bash
sdojo collection list
```

Output:
```
NAME                    VISIBILITY   SKILLS   STARS   FORKS
yourusername/my-skills     private       12       -       -
yourusername/shared        public        45      23       5
```

### Create a New Collection

```bash
sdojo collection create my-new-collection
sdojo collection create my-new-collection --visibility public
sdojo collection create my-new-collection --description "My awesome skills"
```

### Fork a Public Collection

```bash
sdojo collection fork anthropic/core-skills
# Creates: yourusername/core-skills
```

### View Collection Details

```bash
sdojo collection show anthropic/core-skills
```

### Delete a Collection

```bash
sdojo collection delete yourusername/old-collection
```

## Cloning & Syncing

### Clone a Collection

```bash
# Clone to directory with same name as collection
sdojo clone anthropic/core-skills

# Clone to custom directory
sdojo clone anthropic/core-skills ./my-skills
```

This creates a local workspace:
```
core-skills/
├── .skillsdojo/
│   ├── config.json    # Remote connection info
│   └── index.json     # File tracking for change detection
├── code-review/
│   └── SKILL.md
├── debugging/
│   └── SKILL.md
└── README.md
```

### Check Status

See what files have changed locally:

```bash
sdojo status
```

Output:
```
Collection: yourusername/my-skills
Branch: main

Changes not yet pushed:
  modified:   code-review/SKILL.md
  new file:   data-analysis/SKILL.md
  deleted:    old-skill/SKILL.md

Run 'sdojo push' to create a pull request with these changes.
```

### View Diffs

```bash
# Show all changes
sdojo diff

# Show changes for specific skill
sdojo diff code-review
```

### Pull Latest Changes

```bash
# Pull and merge with local changes
sdojo pull

# Force overwrite local changes
sdojo pull --force
```

### Push Changes (Create Pull Request)

```bash
# Interactive - prompts for title and description
sdojo push

# With title
sdojo push --title "Update code review skill"

# With title and description
sdojo push --title "Fix bug" --description "Fixed the edge case handling"
```

## Managing Skills

### List Skills

```bash
# In current workspace
sdojo skill list

# In specific collection
sdojo skill list anthropic/core-skills

# Search within collection
sdojo skill list --search "review"
```

### Create a New Skill

```bash
sdojo skill create my-new-skill
sdojo skill create tools/web-scraper  # Nested path
```

This creates a skill template:
```yaml
---
name: my-new-skill
description: TODO: Add description
user-invocable: true
allowed-tools: []
---

# My New Skill

Instructions for this skill...
```

### View Skill Details

```bash
sdojo skill show code-review
```

### Delete a Skill

```bash
sdojo skill delete old-skill
```

### Move/Rename a Skill

```bash
sdojo skill move old-name new-name
sdojo skill move utils/helper tools/helper  # Move between directories
```

## Pull Requests

### List Pull Requests

```bash
# List open PRs
sdojo pr list

# List all PRs (including merged/closed)
sdojo pr list --state merged
sdojo pr list --state closed

# For specific collection
sdojo pr list anthropic/core-skills
```

### View PR Details

```bash
sdojo pr view 12
```

### Merge a PR

```bash
sdojo pr merge 12
```

### Close a PR (without merging)

```bash
sdojo pr close 12
```

## Search

Search public skills across all collections:

```bash
sdojo search "code review"
sdojo search "mcp server"
sdojo search "data analysis" --limit 50
```

Output:
```
Search results for "code review"

┌──────────────────────────────────┬─────────────────────────────────────────┐
│ SKILL                            │ DESCRIPTION                             │
├──────────────────────────────────┼─────────────────────────────────────────┤
│ anthropic/core/code-review       │ Review code for bugs and improvements   │
│ community/tools/pr-reviewer      │ Automated PR review assistant           │
└──────────────────────────────────┴─────────────────────────────────────────┘

Page 1 of 1 (2 total)

Clone a skill collection with: sdojo clone <account>/<collection>
```

## Configuration

### Set Configuration

```bash
sdojo config set api.url https://skillsdojo.ai
sdojo config set defaults.visibility private
```

### View Configuration

```bash
sdojo config get api.url
sdojo config list
```

### Configuration File

Global config is stored at `~/.skillsdojo/config.json`:

```json
{
  "api": {
    "url": "https://skillsdojo.ai"
  },
  "defaults": {
    "visibility": "private"
  },
  "output": {
    "format": "table"
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SKILLSDOJO_API_URL` | Override API URL (default: https://skillsdojo.ai) |
| `SKILLSDOJO_TOKEN` | API token for authentication (useful for CI/CD) |

## JSON Output

Most commands support `--json` for machine-readable output:

```bash
sdojo search "mcp" --json
sdojo collection list --json
sdojo status --json
```

## Common Workflows

### Contributing to Public Skills

```bash
# Fork the collection to your account
sdojo collection fork anthropic/core-skills

# Clone your fork
sdojo clone yourusername/core-skills
cd core-skills

# Make changes
vim code-review/SKILL.md

# Push as PR to your fork
sdojo push --title "Improve code review prompts"
```

### Team Collaboration

```bash
# Clone team's collection
sdojo clone myorg/team-skills
cd team-skills

# Create new skill
sdojo skill create data-pipeline

# Edit and push for review
vim data-pipeline/SKILL.md
sdojo push --title "Add data pipeline skill"

# Team reviews PR #5 and merges
sdojo pr merge 5
```

### CI/CD Integration

```bash
# Use environment token
export SKILLSDOJO_TOKEN="sk_..."

# Clone and sync
sdojo clone myorg/production-skills
cd production-skills

# Check for changes
sdojo status --json | jq '.changes'

# Automated updates
sdojo push --title "Automated update $(date +%Y-%m-%d)"
```

## Troubleshooting

### "Not in a SkillsDojo workspace"

You need to be inside a cloned collection directory:

```bash
sdojo clone yourusername/my-skills
cd my-skills
sdojo status  # Now works
```

### "Authentication required"

Login first:

```bash
sdojo auth login
```

### "Collection not found"

- Check the collection path is correct: `account/collection`
- Ensure you have access (private collections require authentication)
- Verify the collection exists and isn't archived

### "Base SHA does not match"

Your local workspace is out of sync. Pull latest changes first:

```bash
sdojo pull
# Then try pushing again
sdojo push
```

## Command Reference

| Command | Description |
|---------|-------------|
| `sdojo auth login` | Authenticate with SkillsDojo |
| `sdojo auth logout` | Clear credentials |
| `sdojo auth whoami` | Show current user |
| `sdojo clone <path>` | Clone collection locally |
| `sdojo status` | Show local changes |
| `sdojo diff` | Show diff of changes |
| `sdojo pull` | Pull latest from remote |
| `sdojo push` | Push changes as PR |
| `sdojo collection list` | List your collections |
| `sdojo collection create` | Create new collection |
| `sdojo collection fork` | Fork a collection |
| `sdojo collection delete` | Delete collection |
| `sdojo skill list` | List skills |
| `sdojo skill create` | Create new skill |
| `sdojo skill show` | Show skill details |
| `sdojo skill delete` | Delete skill |
| `sdojo skill move` | Move/rename skill |
| `sdojo pr list` | List pull requests |
| `sdojo pr view` | View PR details |
| `sdojo pr merge` | Merge PR |
| `sdojo pr close` | Close PR |
| `sdojo search` | Search public skills |

## Getting Help

```bash
# General help
sdojo --help

# Command-specific help
sdojo clone --help
sdojo collection --help
sdojo skill create --help
```

## License

MIT
