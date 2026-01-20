# Claude Companion

A desktop pet that shows Claude Code's real-time status. Watch your little companion read, write, and work alongside you!

## Installation

Download the latest release for your platform from [GitHub Releases](https://github.com/fredsourcing/claude-companion/releases):

| Platform | Download |
|----------|----------|
| macOS (Apple Silicon) | `Claude Companion-x.x.x-arm64.dmg` |
| macOS (Intel) | `Claude Companion-x.x.x.dmg` |
| Windows | `Claude Companion-x.x.x.exe` |
| Linux | `Claude Companion-x.x.x.AppImage` |

### Setup

**macOS**: Open the `.dmg` and drag Claude Companion to Applications. On first launch, right-click and select "Open" to bypass Gatekeeper.

**Windows**: Run the `.exe` installer and follow the prompts.

**Linux**: Make the `.AppImage` executable (`chmod +x`) and run it.

On first launch, Claude Companion automatically configures the Claude Code hooks needed to receive status updates.

## Usage

Launch Claude Companion from your Applications folder (macOS), Start menu (Windows), or run the AppImage (Linux).

The pet window will appear and float on top of other windows. It automatically updates based on what Claude Code is doing:

- **Reading** - Claude is reading files or searching code
- **Working** - Claude is writing, editing, or running commands
- **Idle** - Claude is waiting for input
- **Done** - Claude finished a task
- **Error** - Something went wrong

### Controls

- **Drag** - Click and drag the pet to move it around your screen
- **Right-click** - Change sticker pack
- **Close** - Quit from the dock/taskbar or Activity Monitor/Task Manager

## How It Works

Claude Companion uses Claude Code's hook system to receive real-time events:

```
Claude Code (Terminal) --[hooks]--> status.json <--[watching]-- Desktop Pet (Electron)
```

1. When you use Claude Code, hooks send events to a status reporter script
2. The script writes status updates to `~/.claude-companion/status.json`
3. The Electron app watches this file and updates the pet's expression

## Requirements

- Claude Code CLI
- Node.js (required for hooks to work - most Claude Code users already have this installed)

## Troubleshooting

### Pet doesn't update when using Claude Code

Check that the hooks are configured in `~/.claude/settings.json`:

```bash
cat ~/.claude/settings.json | grep claude-companion
```

If hooks are missing, try relaunching Claude Companion - it configures hooks automatically on startup.

### Pet window doesn't appear

On macOS, you may need to allow the app in System Preferences > Security & Privacy.

## Development

```bash
git clone https://github.com/fredsourcing/claude-companion
cd claude-companion/app
npm install
npm run dev
```

To build distributable installers:

```bash
npm run dist        # Build for current platform
npm run dist:mac    # macOS .dmg
npm run dist:win    # Windows .exe
npm run dist:linux  # Linux .AppImage
```

Output goes to `app/dist/`.

## License

MIT
