import { readFile, mkdir, writeFile, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'

export const STATUS_DIR = join(homedir(), '.agent-paperclip')
export const COMPANION_HOOKS_DIR = join(STATUS_DIR, 'hooks')
export const CLAUDE_DIR = join(homedir(), '.claude')
export const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json')

export function createHookConfig(hookScriptPath: string): Record<string, unknown[]> {
  const command = `node "${hookScriptPath}"`
  return {
    UserPromptSubmit: [{ hooks: [{ type: 'command', command }] }],
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command }] }],
    Stop: [{ hooks: [{ type: 'command', command }] }],
    Notification: [{ hooks: [{ type: 'command', command }] }]
  }
}

export async function isHookConfigured(): Promise<boolean> {
  // Verify the hook script file exists
  const destPath = join(COMPANION_HOOKS_DIR, 'status-reporter.js')
  if (!existsSync(destPath)) {
    return false
  }

  try {
    const content = await readFile(CLAUDE_SETTINGS_FILE, 'utf-8')
    const settings = JSON.parse(content)
    // Check if any hook references agent-paperclip (or old claude-companion name)
    const hooksStr = JSON.stringify(settings.hooks || {})
    return hooksStr.includes('agent-paperclip') || hooksStr.includes('claude-companion')
  } catch {
    return false
  }
}

export interface SetupHooksOptions {
  getHookSourcePath: () => string
}

export async function setupHooks(options: SetupHooksOptions): Promise<void> {
  // Check if hooks are already configured
  if (await isHookConfigured()) {
    console.log('Agent Paperclip hooks already configured')
    return
  }

  console.log('Setting up Agent Paperclip hooks...')

  // Ensure directories exist
  if (!existsSync(COMPANION_HOOKS_DIR)) {
    await mkdir(COMPANION_HOOKS_DIR, { recursive: true })
  }
  if (!existsSync(CLAUDE_DIR)) {
    await mkdir(CLAUDE_DIR, { recursive: true })
  }

  // Copy hook script to ~/.agent-paperclip/hooks/
  const sourcePath = options.getHookSourcePath()
  const destPath = join(COMPANION_HOOKS_DIR, 'status-reporter.js')

  if (!existsSync(sourcePath)) {
    console.error('Hook source not found:', sourcePath)
    return
  }

  await copyFile(sourcePath, destPath)
  console.log('Copied hook script to', destPath)

  // Copy lib/status-writer.js (required by the hook script)
  const libSourcePath = join(dirname(sourcePath), '..', 'lib', 'status-writer.js')
  if (!existsSync(libSourcePath)) {
    console.error('Lib source not found:', libSourcePath)
    return
  }
  const libDestDir = join(STATUS_DIR, 'lib')
  if (!existsSync(libDestDir)) {
    await mkdir(libDestDir, { recursive: true })
  }
  await copyFile(libSourcePath, join(libDestDir, 'status-writer.js'))
  console.log('Copied lib/status-writer.js to', libDestDir)

  // Read existing Claude settings or create new
  let claudeSettings: Record<string, unknown> = {}
  if (existsSync(CLAUDE_SETTINGS_FILE)) {
    // Create backup BEFORE attempting to parse
    const backupFile = `${CLAUDE_SETTINGS_FILE}.backup-${Date.now()}`
    await copyFile(CLAUDE_SETTINGS_FILE, backupFile)
    console.log('Backed up settings to', backupFile)

    try {
      const content = await readFile(CLAUDE_SETTINGS_FILE, 'utf-8')
      claudeSettings = JSON.parse(content)
    } catch {
      console.warn('Could not parse existing settings, starting fresh (backup saved)')
      claudeSettings = {}
    }
  }

  // Merge hooks
  if (!claudeSettings.hooks) {
    claudeSettings.hooks = {}
  }
  const hooks = claudeSettings.hooks as Record<string, unknown[]>
  const newHooks = createHookConfig(destPath)

  for (const [eventName, eventHooks] of Object.entries(newHooks)) {
    if (!hooks[eventName]) {
      hooks[eventName] = []
    }
    // Check if agent-paperclip hook already exists (also match old name for upgrades)
    const hookArray = hooks[eventName] as Array<{ hooks?: Array<{ command?: string }> }>
    const existingIndex = hookArray.findIndex(
      (h) => h.hooks?.some((hook) =>
        hook.command?.includes('agent-paperclip') || hook.command?.includes('claude-companion')
      )
    )
    if (existingIndex >= 0) {
      hookArray[existingIndex] = eventHooks[0] as (typeof hookArray)[number]
    } else {
      hookArray.push(eventHooks[0] as (typeof hookArray)[number])
    }
  }

  // Write updated settings
  await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(claudeSettings, null, 2))
  console.log('Updated Claude settings at', CLAUDE_SETTINGS_FILE)
}
