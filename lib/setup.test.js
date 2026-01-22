"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
// Mock fs before importing the module
const mockFs = {
    existsSync: vitest_1.vi.fn(),
    mkdirSync: vitest_1.vi.fn(),
    copyFileSync: vitest_1.vi.fn(),
    readFileSync: vitest_1.vi.fn(),
    writeFileSync: vitest_1.vi.fn()
};
vitest_1.vi.mock('fs', () => ({
    default: mockFs,
    ...mockFs
}));
// Import after mocking
const { ensureDir, copyHookScript, createHookConfig, readSettings, createBackup, mergeHooks, writeSettings, runSetupSync } = await Promise.resolve().then(() => __importStar(require('./setup')));
(0, vitest_1.describe)('ensureDir', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('creates directory if it does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        ensureDir('/test/dir');
        (0, vitest_1.expect)(mockFs.mkdirSync).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });
    (0, vitest_1.it)('does not create directory if it exists', () => {
        mockFs.existsSync.mockReturnValue(true);
        ensureDir('/test/dir');
        (0, vitest_1.expect)(mockFs.mkdirSync).not.toHaveBeenCalled();
    });
});
(0, vitest_1.describe)('copyHookScript', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('copies file from source to destination', () => {
        mockFs.existsSync.mockReturnValue(true);
        copyHookScript('/source/hook.js', '/dest/hook.js');
        (0, vitest_1.expect)(mockFs.copyFileSync).toHaveBeenCalledWith('/source/hook.js', '/dest/hook.js');
    });
    (0, vitest_1.it)('creates destination directory if needed', () => {
        mockFs.existsSync.mockReturnValue(false);
        copyHookScript('/source/hook.js', '/dest/subdir/hook.js');
        (0, vitest_1.expect)(mockFs.mkdirSync).toHaveBeenCalledWith('/dest/subdir', { recursive: true });
    });
});
(0, vitest_1.describe)('createHookConfig', () => {
    (0, vitest_1.it)('creates hook config with correct command format', () => {
        const config = createHookConfig('/path/to/hooks/status-reporter.js');
        (0, vitest_1.expect)(config.PreToolUse).toEqual([
            { matcher: '*', hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
        ]);
        (0, vitest_1.expect)(config.PostToolUse).toEqual([
            { matcher: '*', hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
        ]);
        (0, vitest_1.expect)(config.Stop).toEqual([
            { hooks: [{ type: 'command', command: 'node "/path/to/hooks/status-reporter.js"' }] }
        ]);
    });
    (0, vitest_1.it)('includes all required hook events', () => {
        const config = createHookConfig('/path/to/script.js');
        (0, vitest_1.expect)(Object.keys(config)).toContain('UserPromptSubmit');
        (0, vitest_1.expect)(Object.keys(config)).toContain('PreToolUse');
        (0, vitest_1.expect)(Object.keys(config)).toContain('PostToolUse');
        (0, vitest_1.expect)(Object.keys(config)).toContain('Stop');
        (0, vitest_1.expect)(Object.keys(config)).toContain('Notification');
    });
});
(0, vitest_1.describe)('readSettings', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('returns empty object if file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        const result = readSettings('/path/to/settings.json');
        (0, vitest_1.expect)(result).toEqual({});
    });
    (0, vitest_1.it)('parses and returns settings from file', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({ apiKey: 'test' }));
        const result = readSettings('/path/to/settings.json');
        (0, vitest_1.expect)(result).toEqual({ apiKey: 'test' });
    });
    (0, vitest_1.it)('throws on invalid JSON', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('not valid json');
        (0, vitest_1.expect)(() => readSettings('/path/to/settings.json')).toThrow();
    });
});
(0, vitest_1.describe)('createBackup', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
    });
    (0, vitest_1.it)('creates backup with timestamp', () => {
        const backupPath = createBackup('/path/to/settings.json');
        (0, vitest_1.expect)(mockFs.copyFileSync).toHaveBeenCalledWith('/path/to/settings.json', '/path/to/settings.json.backup-1705314600000');
        (0, vitest_1.expect)(backupPath).toBe('/path/to/settings.json.backup-1705314600000');
    });
});
(0, vitest_1.describe)('mergeHooks', () => {
    (0, vitest_1.it)('adds hooks to empty settings', () => {
        const settings = {};
        const newHooks = createHookConfig('/path/to/hook.js');
        const result = mergeHooks(settings, newHooks);
        (0, vitest_1.expect)(result.hooks).toBeDefined();
        (0, vitest_1.expect)(result.hooks.PreToolUse).toHaveLength(1);
    });
    (0, vitest_1.it)('preserves existing settings', () => {
        const settings = { apiKey: 'secret' };
        const newHooks = createHookConfig('/path/to/hook.js');
        const result = mergeHooks(settings, newHooks);
        (0, vitest_1.expect)(result.apiKey).toBe('secret');
    });
    (0, vitest_1.it)('preserves existing hooks from other sources', () => {
        const settings = {
            hooks: {
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other-hook' }] }]
            }
        };
        const newHooks = createHookConfig('/path/to/hook.js');
        const result = mergeHooks(settings, newHooks);
        (0, vitest_1.expect)(result.hooks.PreToolUse).toHaveLength(2);
        (0, vitest_1.expect)(result.hooks.PreToolUse[0].hooks[0].command).toBe('other-hook');
    });
    (0, vitest_1.it)('updates existing claude-companion hooks instead of duplicating', () => {
        const settings = {
            hooks: {
                PreToolUse: [
                    { matcher: '*', hooks: [{ type: 'command', command: 'node "/old/claude-companion/hook.js"' }] }
                ]
            }
        };
        const newHooks = createHookConfig('/new/path/to/hook.js');
        const result = mergeHooks(settings, newHooks);
        (0, vitest_1.expect)(result.hooks.PreToolUse).toHaveLength(1);
        (0, vitest_1.expect)(result.hooks.PreToolUse[0].hooks[0].command).toContain('/new/path/to/hook.js');
    });
});
(0, vitest_1.describe)('writeSettings', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('writes settings as formatted JSON', () => {
        mockFs.existsSync.mockReturnValue(true);
        writeSettings('/path/to/settings.json', { apiKey: 'test' });
        (0, vitest_1.expect)(mockFs.writeFileSync).toHaveBeenCalledWith('/path/to/settings.json', JSON.stringify({ apiKey: 'test' }, null, 2));
    });
    (0, vitest_1.it)('creates directory if it does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        writeSettings('/path/to/settings.json', {});
        (0, vitest_1.expect)(mockFs.mkdirSync).toHaveBeenCalledWith('/path/to', { recursive: true });
    });
});
(0, vitest_1.describe)('runSetupSync', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.it)('returns error if hook source does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        const result = runSetupSync({
            hookSourcePath: '/nonexistent/hook.js',
            hookDestPath: '/dest/hook.js',
            settingsPath: '/path/to/settings.json'
        });
        (0, vitest_1.expect)(result.success).toBe(false);
        (0, vitest_1.expect)(result.error).toContain('Hook source not found');
    });
    (0, vitest_1.it)('copies hook and creates settings when no existing settings', () => {
        mockFs.existsSync.mockImplementation((path) => {
            if (path === '/source/hook.js')
                return true;
            return false;
        });
        const result = runSetupSync({
            hookSourcePath: '/source/hook.js',
            hookDestPath: '/dest/hook.js',
            settingsPath: '/path/to/settings.json'
        });
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.hookPath).toBe('/dest/hook.js');
        (0, vitest_1.expect)(result.backupPath).toBeUndefined();
        (0, vitest_1.expect)(mockFs.copyFileSync).toHaveBeenCalled();
        (0, vitest_1.expect)(mockFs.writeFileSync).toHaveBeenCalled();
    });
    (0, vitest_1.it)('creates backup when settings exist', () => {
        vitest_1.vi.useFakeTimers();
        vitest_1.vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({ existing: true }));
        const result = runSetupSync({
            hookSourcePath: '/source/hook.js',
            hookDestPath: '/dest/hook.js',
            settingsPath: '/path/to/settings.json'
        });
        (0, vitest_1.expect)(result.success).toBe(true);
        (0, vitest_1.expect)(result.backupPath).toBe('/path/to/settings.json.backup-1705314600000');
    });
    (0, vitest_1.it)('continues with empty settings when JSON parse fails', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('invalid json {{{');
        const result = runSetupSync({
            hookSourcePath: '/source/hook.js',
            hookDestPath: '/dest/hook.js',
            settingsPath: '/path/to/settings.json'
        });
        (0, vitest_1.expect)(result.success).toBe(true);
        // Should still write settings with our hooks
        (0, vitest_1.expect)(mockFs.writeFileSync).toHaveBeenCalled();
        const writtenContent = mockFs.writeFileSync.mock.calls[0][1];
        (0, vitest_1.expect)(writtenContent).toContain('"hooks"');
    });
});
