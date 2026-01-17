#!/usr/bin/env node
"use strict";
/**
 * Claude Companion CLI Launcher
 *
 * Launches the Electron desktop pet app as a detached process
 * so it continues running after the terminal is closed.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
// Get the electron binary path from the installed electron package
// eslint-disable-next-line @typescript-eslint/no-require-imports
const electronPath = require('electron');
// Path to the built Electron app
const appPath = path_1.default.join(__dirname, '..', 'out', 'main', 'index.js');
// Spawn Electron as a detached process
const child = (0, child_process_1.spawn)(electronPath, [appPath], {
    detached: true,
    stdio: 'ignore'
});
// Unref to allow the parent process to exit independently
child.unref();
console.log('Claude Companion launched!');
