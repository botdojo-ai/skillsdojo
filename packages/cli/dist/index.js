#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { authCommand } from './commands/auth.js';
import { collectionCommand } from './commands/collection.js';
import { cloneCommand } from './commands/clone.js';
import { statusCommand } from './commands/status.js';
import { diffCommand } from './commands/diff.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { skillCommand } from './commands/skill.js';
import { prCommand } from './commands/pr.js';
import { searchCommand } from './commands/search.js';
const program = new Command();
program
    .name('sdojo')
    .description('SkillsDojo CLI - Manage AI agent skills from the command line')
    .version('0.1.0');
// Auth commands
program.addCommand(authCommand);
// Collection commands
program.addCommand(collectionCommand);
// Clone command (top-level)
program.addCommand(cloneCommand);
// Sync commands
program.addCommand(statusCommand);
program.addCommand(diffCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
// Skill commands
program.addCommand(skillCommand);
// PR commands
program.addCommand(prCommand);
// Search command
program.addCommand(searchCommand);
// Error handling
program.configureOutput({
    outputError: (str, write) => {
        write(chalk.red(str));
    },
});
// Parse arguments
program.parse();
//# sourceMappingURL=index.js.map