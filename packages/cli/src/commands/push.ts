import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  findWorkspaceRoot,
  getWorkspaceConfig,
  getWorkspaceIndex,
} from '../lib/config.js';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { getWorkspaceChanges, getSkillsDir, FileChange } from './status.js';

export const pushCommand = new Command('push')
  .description('Push local changes and create a pull request')
  .option('-t, --title <title>', 'Pull request title')
  .option('-d, --description <text>', 'Pull request description')
  .option('--draft', 'Create as draft PR')
  .action(async (options) => {
    requireAuth();

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

    // Get local changes
    const changes = getWorkspaceChanges(workspaceRoot);

    if (changes.length === 0) {
      console.log(chalk.green('Nothing to push'));
      return;
    }

    // Show changes
    console.log(`Creating pull request for ${chalk.cyan(`${config.remote.account}/${config.remote.collection}`)}...`);
    console.log();
    console.log('Changes to include:');
    for (const change of changes) {
      switch (change.status) {
        case 'modified':
          console.log(`  ${chalk.yellow('modified:')}   ${change.path}`);
          break;
        case 'new':
          console.log(`  ${chalk.green('new file:')}   ${change.path}`);
          break;
        case 'deleted':
          console.log(`  ${chalk.red('deleted:')}    ${change.path}`);
          break;
      }
    }
    console.log();

    // Get PR title and description
    let title = options.title;
    let description = options.description;

    if (!title) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'title',
          message: 'PR Title:',
          validate: (input) => input.trim().length > 0 || 'Title is required',
          default: generateDefaultTitle(changes),
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):',
        },
      ]);

      title = answers.title;
      description = answers.description;
    }

    const spinner = ora('Creating pull request...').start();

    // Build changes array for API
    const skillsDir = getSkillsDir(workspaceRoot);
    const apiChanges = changes.map((change) => {
      const result: {
        path: string;
        action: 'create' | 'modify' | 'delete';
        content?: string;
      } = {
        path: change.path,
        action: change.status === 'new' ? 'create' : change.status === 'modified' ? 'modify' : 'delete',
      };

      // Include content for new and modified files
      if (change.status !== 'deleted') {
        const fullPath = join(skillsDir, change.path);
        if (existsSync(fullPath)) {
          result.content = readFileSync(fullPath, 'utf-8');
        }
      }

      return result;
    });

    // Submit changes
    const response = await api.submitChanges(config.remote.collectionId, {
      baseSha: index.commitSha,
      title,
      description: description || undefined,
      changes: apiChanges,
    });

    if (response.error || !response.data) {
      spinner.fail('Failed to create pull request');
      console.error(chalk.red(response.error?.message || 'Unknown error'));
      process.exit(1);
    }

    const pr = response.data.pullRequest;

    spinner.succeed(`Created PR #${pr.number}: ${title}`);
    console.log();
    console.log(chalk.cyan(`${config.remote.url}/pulls/${pr.number}`));
  });

function generateDefaultTitle(changes: FileChange[]): string {
  if (changes.length === 1) {
    const change = changes[0];
    const action = change.status === 'new' ? 'Add' : change.status === 'modified' ? 'Update' : 'Remove';

    // Extract skill name from path
    const pathParts = change.path.split('/');
    const skillName = pathParts[0]; // Assumes structure: skill-name/SKILL.md

    return `${action} ${skillName}`;
  }

  const newCount = changes.filter((c) => c.status === 'new').length;
  const modifiedCount = changes.filter((c) => c.status === 'modified').length;
  const deletedCount = changes.filter((c) => c.status === 'deleted').length;

  const parts = [];
  if (newCount > 0) parts.push(`add ${newCount} skill${newCount > 1 ? 's' : ''}`);
  if (modifiedCount > 0) parts.push(`update ${modifiedCount} skill${modifiedCount > 1 ? 's' : ''}`);
  if (deletedCount > 0) parts.push(`remove ${deletedCount} skill${deletedCount > 1 ? 's' : ''}`);

  return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}
