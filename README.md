# Stellavault for Obsidian

**Knowledge intelligence for Obsidian** — semantic search, memory decay tracking, and learning paths powered by local AI embeddings.

> Your second brain shouldn't forget. Stellavault tracks what you're forgetting and helps you review it before it fades.

## Features

- **Semantic Search** — Find notes by meaning, not just keywords. Powered by local embeddings (no API calls).
- **Memory Decay Tracking** — See which notes are fading from memory using the FSRS spaced repetition algorithm.
- **Learning Paths** — Get personalized review suggestions based on knowledge gaps and decay patterns.
- **Auto-indexing** — Vault changes are automatically indexed in real-time.
- **Privacy-first** — Everything runs locally. No data leaves your machine.

## Installation

### From Obsidian Community Plugins (coming soon)

1. Open Settings → Community Plugins
2. Search "Stellavault"
3. Install and enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/Evanciel/stellavault-obsidian/releases)
2. Create `{vault}/.obsidian/plugins/stellavault/` folder
3. Copy the files into that folder
4. Enable in Settings → Community Plugins

## Usage

| Command | Description |
|---------|-------------|
| `Stellavault: Search knowledge base` | Semantic search across your vault |
| `Stellavault: Index vault` | Rebuild the search index |
| `Stellavault: Show memory decay panel` | Open the decay sidebar |
| `Stellavault: Show learning path` | Get personalized review suggestions |

Or click the brain icon in the ribbon to quick-search.

## Settings

- **Auto-index** — Toggle real-time indexing on file changes
- **Max results** — Number of search results (5-50)
- **Decay badges** — Show decay indicators in file explorer
- **Decay threshold** — When to warn about fading notes (0.1-0.9)
- **Language** — English, Korean, Japanese

## Requirements

- Obsidian 1.5.0+
- Desktop only (uses local SQLite + AI embeddings)

## Development

```bash
git clone https://github.com/Evanciel/stellavault-obsidian
cd stellavault-obsidian
npm install
npm run dev
```

Then symlink the repo to your vault's plugins folder:
```bash
# Windows
mklink /D "path\to\vault\.obsidian\plugins\stellavault" "path\to\stellavault-obsidian"

# macOS/Linux
ln -s /path/to/stellavault-obsidian /path/to/vault/.obsidian/plugins/stellavault
```

## Links

- [Stellavault Core](https://github.com/Evanciel/stellavault) — The knowledge intelligence engine
- [npm: stellavault](https://www.npmjs.com/package/stellavault) — Core package on npm

## License

MIT
