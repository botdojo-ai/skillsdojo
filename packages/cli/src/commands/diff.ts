import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { diffLines, Change } from 'diff';
import { findWorkspaceRoot, getWorkspaceConfig, getWorkspaceIndex } from '../lib/config.js';
import { getWorkspaceChanges } from './status.js';

function formatDiff(changes: Change[]): void {
  for (const change of changes) {
    const lines = change.value.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip empty last line from split
      if (i === lines.length - 1 && line === '') {
        continue;
      }

      if (change.added) {
        console.log(chalk.green(`+ ${line}`));
      } else if (change.removed) {
        console.log(chalk.red(`- ${line}`));
      } else {
        console.log(chalk.gray(`  ${line}`));
      }
    }
  }
}

export const diffCommand = new Command('diff')
  .description('Show diff of local changes')
  .argument('[path]', 'Specific file or skill path to diff')
  .option('--no-color', 'Disable colors')
  .action((path, options) => {
    const workspaceRoot = findWorkspaceRoot();

    if (!workspaceRoot) {
      console.error(chalk.red('Not in a SkillsDojo workspace'));
      console.error(chalk.gray('Run `sdojo clone <account/collection>` to clone a collection'));
      process.exit(1);
    }

    const config = getWorkspaceConfig(workspaceRoot);
    const index = getWorkspaceIndex(workspaceRoot);

    if (!config || !index) {
      console.error(chalk.red('Invalid workspace configuration'));
      process.exit(1);
    }

    const changes = getWorkspaceChanges(workspaceRoot);

    // Filter to specific path if provided
    const filteredChanges = path
      ? changes.filter((c) => c.path.startsWith(path))
      : changes;

    if (filteredChanges.length === 0) {
      console.log(chalk.green('No changes'));
      return;
    }

    for (const change of filteredChanges) {
      const fullPath = join(workspaceRoot, change.path);

      console.log(chalk.bold(`diff ${change.path}`));
      console.log(chalk.gray('─'.repeat(60)));

      switch (change.status) {
        case 'new': {
          if (existsSync(fullPath)) {
            const newContent = readFileSync(fullPath, 'utf-8');
            const diffResult = diffLines('', newContent);
            formatDiff(diffResult);
          }
          break;
        }

        case 'deleted': {
          // For deleted files, we need the original content from the index
          // This is a limitation - we'd need to fetch from API
          console.log(chalk.red('(file deleted - original content not available locally)'));
          break;
        }

        case 'modified': {
          // For modified files, we need the original content
          // This is also a limitation - we'd need to store original or fetch
          // For now, show current content with note
          if (existsSync(fullPath)) {
            const currentContent = readFileSync(fullPath, 'utf-8');
            console.log(chalk.yellow('(showing current content - original not cached)'));
            console.log();

            const lines = currentContent.split('\n');
            for (const line of lines) {
              console.log(`  ${line}`);
            }
          }
          break;
        }
      }

      console.log();
    }
  });
