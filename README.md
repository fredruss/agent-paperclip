# Claude Code Companion

<img src="app/resources/icon.png" width="128" alt="Claude Code Companion icon">

A desktop companion that lets you monitor Claude Code. See when it's done, when it needs input, and how much context you've used without having to stare at your terminal. Also, it's cute.

<img src="app/resources/companion_screenshot.png" width="200" alt="Screenshot of Claude Code Companion showing the pet with a speech bubble and token count">

## Installation

### Prerequisites

- Node.js 18+
- Claude Code CLI

### Option 1: npm (recommended)

```bash
npm install -g claude-code-companion
```

This installs the app and prompts to configure Claude Code hooks. Then run:

```bash
claude-companion
```

### Option 2: From source

1. Clone and install:
   ```bash
   git clone https://github.com/fredruss/claude-companion
   cd claude-companion
   npm install
   ```
   This installs dependencies and prompts to configure Claude Code hooks. Type `y` to allow.

2. Run the app:
   ```bash
   npm run dev
   ```

## Usage

The pet window will appear and float on top of other windows. It automatically updates based on what Claude Code is doing:

- **Reading** - Claude is reading files or searching code
- **Working** - Claude is writing, editing, or running commands
- **Waiting** - Claude needs your permission or has a question
- **Idle** - Claude is waiting for input
- **Done** - Claude finished a task
- **Error** - Something went wrong

The pet also displays the context window usage (input + cache tokens from the latest API call).

### Controls

- **Drag** - Click and drag the pet to move it around your screen
- **Right-click** - Change sticker pack (2 packs currently available + basic SVG pack)
- **Close** - Quit from the dock/taskbar or Activity Monitor/Task Manager

## How It Works

Claude Code Companion uses Claude Code's hook system to receive real-time events:

```
Claude Code (Terminal) --[hooks]--> status.json <--[watching]-- Desktop Pet (Electron)
```

1. When you use Claude Code, hooks send events to a status reporter script
2. The script writes status updates to `~/.claude-companion/status.json`
3. The Electron app watches this file and updates the pet's expression

## Privacy

The companion displays status information in `~/.claude-companion/status.json`.

**What IS captured in status.json:**
- **Tool names** - Read, Write, Bash, Grep, etc.
- **Filenames** - Names of files being read, written, or edited (e.g., `Reading index.ts...`)
- **Command names** - First word of bash commands (e.g., `Running npm...`)
- **Search patterns** - Grep patterns, truncated to 20 characters (e.g., `Searching for "pattern"...`)
- **Thinking snippets** - Brief excerpts of Claude's internal reasoning, truncated to ~40 characters
- **Token counts** - Current context window usage

**What is NOT captured:**
- Claude's responses to you (only internal "thinking" blocks are read)
- Your prompts or questions
- File contents or code
- Full bash commands (only the first word)

All data stays local on your machine and is never sent anywhere.

### Transcript Data

Token counts and thinking snippets are extracted from Claude's transcript file (`~/.claude/projects/.../session.jsonl`), not from hook events. Thinking snippets only appear when using models with extended thinking enabled (like Opus).

## Building from Source

To build distributable installers for your platform:

```bash
cd app
npm run dist        # Build for current platform
npm run dist:mac    # macOS .dmg
npm run dist:win    # Windows .exe
npm run dist:linux  # Linux .AppImage
```

Output goes to `app/dist/`.

Note: macOS builds will show a security warning unless code-signed with an Apple Developer certificate.

## Troubleshooting

### Pet doesn't update when using Claude Code

Check that the hooks are configured in `~/.claude/settings.json`:

```bash
cat ~/.claude/settings.json | grep claude-companion
```

If hooks are missing, run `node bin/claude-companion.js setup` from the project root to configure them.

### Pet window doesn't appear

On macOS, you may need to allow the app in System Preferences > Security & Privacy.

## License

MIT
