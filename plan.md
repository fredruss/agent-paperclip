# Claude Companion - Implementation Plan

## Overview
A cute desktop pet companion that shows Claude Code's real-time status in an always-visible floating window.

**Choices:**
- Visual style: Cute mascot/character with animations
- Tech stack: Electron + React
- UI: Always-visible floating window (desktop pet style)

## Architecture

```
┌─────────────────┐      JSON file       ┌──────────────────┐
│   Claude Code   │  ───────────────────▶│  Desktop Pet     │
│   (Terminal)    │  ~/.claude-companion │  (Floating)      │
│                 │       /status.json   │                  │
│  [Hooks fire    │                      │  [Watches file,  │
│   on events]    │                      │   animates pet]  │
└─────────────────┘                      └──────────────────┘
```

## Implementation Status

### Completed

#### Core Desktop Pet App
- [x] Electron app with floating transparent window
- [x] Frameless, always-on-top, draggable window
- [x] SVG-based animated pet with 6 states (idle, thinking, working, reading, done, error)
- [x] Speech bubble showing current Claude Code activity
- [x] File watcher monitoring `~/.claude-companion/status.json` via chokidar
- [x] IPC communication between main process and renderer
- [x] React components: Pet, StatusBubble
- [x] Custom hooks: useStatus, useStateTransition, useAutoHide

#### Hook System
- [x] Hook script (`hooks/status-reporter.js`) receives Claude Code events via stdin
- [x] Maps tool names to pet states and human-readable actions
- [x] Handles events: UserPromptSubmit, PreToolUse, PostToolUse, Stop
- [x] "Thinking" state detection via UserPromptSubmit hook - shows thinking state before tools are used
- [x] Writes status to `~/.claude-companion/status.json`
- [x] Fixed event parsing to use correct Claude Code field names (`hook_event_name`, `tool_response.success`)
- [x] Auto-idle timeout (4s) returns pet to idle after showing "done" state

#### NPM Package Distribution
- [x] Root `package.json` for npm global package
- [x] CLI launcher (`bin/claude-companion.js`) - spawns detached Electron process
- [x] Automatic hook configuration on install (`scripts/postinstall.js`)
- [x] Hook cleanup on uninstall (`scripts/preuninstall.js`)
- [x] Converted hook script to CommonJS for npm compatibility
- [x] `.npmignore` to exclude dev files from published package
- [x] `README.md` with installation and usage instructions
- [x] Marked `app/package.json` as private to prevent accidental publish

### Known Limitations

- **Pure text responses (no tools)** - When Claude generates a response without using any tools, the pet will show "thinking" but won't transition to "working"/"reading" states. It will still show "done" when Claude finishes.

### Remaining Work

#### Polish & Packaging
- [ ] Add tray icon for quick access/quit
- [ ] Package as .dmg with electron-builder
- [ ] Optional: auto-launch on login
- [ ] Publish to npm registry

### Nice-to-Have (Future)
- "Waiting" state when Claude needs human intervention (permission prompts, questions)
- Display token usage statistics
- Click pet to open detailed activity log
- Sound effects (optional, toggleable)
- Multiple pet skins/themes
- Pet "moods" based on task success/failure rate

## Project Structure

```
claude-companion/
├── package.json              # NPM package (global install)
├── bin/
│   └── claude-companion.js   # CLI launcher
├── scripts/
│   ├── postinstall.js        # Configures hooks on install
│   └── preuninstall.js       # Removes hooks on uninstall
├── hooks/
│   └── status-reporter.js    # Hook script (CommonJS)
├── app/                      # Electron app (dev only, private)
│   ├── package.json
│   ├── src/
│   │   ├── main/index.ts     # Electron main process
│   │   ├── preload/index.ts  # Preload script
│   │   ├── renderer/         # React app
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── Pet.tsx
│   │   │   │   └── StatusBubble.tsx
│   │   │   └── hooks/
│   │   │       ├── useStatus.ts
│   │   │       ├── useStateTransition.ts
│   │   │       └── useAutoHide.ts
│   │   └── shared/types.ts   # Shared TypeScript types
│   └── electron.vite.config.ts
├── out/                      # Built Electron app (published to npm)
├── README.md
└── .npmignore
```

## Installation

```bash
npm install -g claude-companion
claude-companion  # launches the desktop pet
```

## Development

```bash
cd app
npm install
npm run dev      # Development mode with hot reload
npm run build    # Build for production
```

## Status File Format

`~/.claude-companion/status.json`:
```json
{
  "status": "working",
  "action": "Editing src/index.ts...",
  "timestamp": 1705412345000
}
```

## Hook Configuration

Automatically added to `~/.claude/settings.json` on install:
```json
{
  "hooks": {
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "node \"~/.claude-companion/hooks/status-reporter.js\""}]}],
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "node \"~/.claude-companion/hooks/status-reporter.js\""}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "node \"~/.claude-companion/hooks/status-reporter.js\""}]}],
    "Stop": [{"hooks": [{"type": "command", "command": "node \"~/.claude-companion/hooks/status-reporter.js\""}]}]
  }
}
```

## Resources
- [Claude Code Hooks Docs](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [Electron + React setup](https://electron-vite.org/)
- [chokidar file watcher](https://github.com/paulmillr/chokidar)
