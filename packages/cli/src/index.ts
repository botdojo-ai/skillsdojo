#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'child_process';
import { authCommand } from './commands/auth.js';
import { collectionCommand } from './commands/collection.js';
import { skillCommand } from './commands/skill.js';
import { initCommand } from './commands/init.js';
import { cloneCommand } from './commands/clone.js';
import { statusCommand } from './commands/status.js';
import { pushCommand } from './commands/push.js';
import { prCommand } from './commands/pr.js';
import { downloadCommand } from './commands/download.js';
import { addSkillFromDojo } from './commands/add-skill.js';

const program = new Command();

program
  .name('skillsd')
  .description('SkillsDojo CLI - Manage AI agent skills')
  .version('0.1.0');

// =============================================================================
// Skills CLI pass-through commands (uses npx skills under the hood)
// =============================================================================

/**
 * Pass command through to npx skills
 */
function passToSkills(args: string[]) {
  const child = spawn('npx', ['skills', ...args], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error(chalk.red('Failed to run skills CLI:'), err.message);
    console.error(chalk.gray('Make sure you have npx available'));
    process.exit(1);
  });
}

/**
 * Check if source is a SkillsDojo path (account/collection/skill)
 * vs a skills.sh path (owner/repo@skill or URL)
 */
function isDojoPath(source: string): boolean {
  // URLs are not dojo paths
  if (source.includes('://') || source.startsWith('http')) return false;
  // Contains @ means it's a skills.sh path (owner/repo@skill)
  if (source.includes('@')) return false;
  // Must have exactly 3 parts: account/collection/skill
  const parts = source.split('/');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

// Add command - handles both skills.sh and SkillsDojo
program
  .command('add <source>')
  .description('Add skills from skills.sh (owner/repo@skill) or SkillsDojo (account/collection/skill)')
  .option('-g, --global', 'Install globally (user-level)')
  .option('-a, --agent <agents...>', 'Install to specific agents')
  .option('-s, --skill <skills...>', 'Install specific skills')
  .option('-l, --list', 'List available skills without installing')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--all', 'Install all skills to all agents')
  .allowUnknownOption()
  .action(async (source, options, command) => {
    // Check if this is a SkillsDojo path
    if (isDojoPath(source)) {
      const [account, collection, skill] = source.split('/');
      await addSkillFromDojo(account, collection, skill, {
        global: options.global,
        agents: options.agent,
        list: options.list,
        yes: options.yes,
      });
      return;
    }

    // Otherwise, pass through to skills CLI
    const args = ['add', source, ...command.args.slice(1)];
    if (options.global) args.push('-g');
    if (options.agent) args.push('-a', ...options.agent);
    if (options.skill) args.push('-s', ...options.skill);
    if (options.list) args.push('-l');
    if (options.yes) args.push('-y');
    if (options.all) args.push('--all');
    passToSkills(args);
  });

// Remove command - pass through to skills CLI
program
  .command('remove [skills...]')
  .alias('rm')
  .description('Remove installed skills')
  .option('-g, --global', 'Remove from global scope')
  .option('-a, --agent <agents...>', 'Remove from specific agents')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--all', 'Remove all installed skills')
  .allowUnknownOption()
  .action((skills, options) => {
    const args = ['remove', ...(skills || [])];
    if (options.global) args.push('-g');
    if (options.agent) args.push('-a', ...options.agent);
    if (options.yes) args.push('-y');
    if (options.all) args.push('--all');
    passToSkills(args);
  });

// List command - pass through to skills CLI
program
  .command('list')
  .alias('ls')
  .description('List installed skills')
  .option('-g, --global', 'List global skills')
  .option('-a, --agent <agents...>', 'Filter by specific agents')
  .allowUnknownOption()
  .action((options) => {
    const args = ['list'];
    if (options.global) args.push('-g');
    if (options.agent) args.push('-a', ...options.agent);
    passToSkills(args);
  });

// Find command - pass through to skills CLI
program
  .command('find [query]')
  .description('Search for skills interactively')
  .allowUnknownOption()
  .action((query) => {
    const args = ['find'];
    if (query) args.push(query);
    passToSkills(args);
  });

// Init command - pass through to skills CLI
program
  .command('init [name]')
  .description('Initialize a new skill (creates SKILL.md)')
  .allowUnknownOption()
  .action((name) => {
    const args = ['init'];
    if (name) args.push(name);
    passToSkills(args);
  });

// Check command - pass through to skills CLI
program
  .command('check')
  .description('Check for available skill updates')
  .allowUnknownOption()
  .action(() => {
    passToSkills(['check']);
  });

// Update command - pass through to skills CLI
program
  .command('update')
  .description('Update all skills to latest versions')
  .allowUnknownOption()
  .action(() => {
    passToSkills(['update']);
  });

// Generate-lock command - pass through to skills CLI
program
  .command('generate-lock')
  .description('Generate lock file from installed skills')
  .option('--dry-run', 'Preview changes without writing')
  .allowUnknownOption()
  .action((options) => {
    const args = ['generate-lock'];
    if (options.dryRun) args.push('--dry-run');
    passToSkills(args);
  });

// =============================================================================
// SkillsDojo-specific commands
// =============================================================================

// Add collection - shorthand for adding from SkillsDojo
program
  .command('add-collection <path>')
  .alias('ac')
  .description('Add all skills from a SkillsDojo collection (e.g., account/collection)')
  .option('-g, --global', 'Install globally (user-level)')
  .option('-a, --agent <agents...>', 'Install to specific agents')
  .option('-s, --skill <skills...>', 'Install specific skills')
  .option('-l, --list', 'List available skills without installing')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--all', 'Install all skills to all agents')
  .option('--host <host>', 'SkillsDojo host (default: skillsdojo.ai)')
  .action((path, options) => {
    const host = options.host || 'skillsdojo.ai';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const source = `${protocol}://${host}/${path}.git`;

    const args = ['add', source];
    if (options.global) args.push('-g');
    if (options.agent) args.push('-a', ...options.agent);
    if (options.skill) args.push('-s', ...options.skill);
    if (options.list) args.push('-l');
    if (options.yes) args.push('-y');
    if (options.all) args.push('--all');
    passToSkills(args);
  });

// Auth commands
program.addCommand(authCommand);

// Collection commands
program.addCommand(collectionCommand);

// Skill commands
program.addCommand(skillCommand);

// Link command (connect current dir to collection)
program.addCommand(initCommand);

// Clone command (download collection locally)
program.addCommand(cloneCommand);

// Status command (show local changes)
program.addCommand(statusCommand);

// Push command (for contributing to SkillsDojo)
program.addCommand(pushCommand);

// PR commands (for managing contributions)
program.addCommand(prCommand);

// Download command (for downloading collections/skills as zip)
program.addCommand(downloadCommand);

// =============================================================================
// Error handling
// =============================================================================

program.configureOutput({
  outputError: (str, write) => {
    write(chalk.red(str));
  },
});

// Show help if no command provided
if (process.argv.length <= 2) {
  console.log(chalk.cyan(`
  ███████╗██╗  ██╗██╗██╗     ██╗     ███████╗██████╗
  ██╔════╝██║ ██╔╝██║██║     ██║     ██╔════╝██╔══██╗
  ███████╗█████╔╝ ██║██║     ██║     ███████╗██║  ██║
  ╚════██║██╔═██╗ ██║██║     ██║     ╚════██║██║  ██║
  ███████║██║  ██╗██║███████╗███████╗███████║██████╔╝
  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚══════╝╚═════╝
`));
  program.outputHelp();
  process.exit(0);
}

// Parse arguments
program.parse();
