import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import {
  findWorkspaceRoot,
  getWorkspaceConfig,
  getWorkspaceIndex,
  saveWorkspaceIndex,
  saveWorkspaceConfig,
} from '../lib/config.js';
import { api } from '../lib/api.js';
import { getWorkspaceChanges } from './status.js';

export const pullCommand = new Command('pull')
  .description('Pull latest changes from remote')
  .option('-f, --force', 'Overwrite local changes')
  .action(async (options) => {
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

    // Check for local changes
    const localChanges = getWorkspaceChanges(workspaceRoot);

    if (localChanges.length > 0 && !options.force) {
      console.log(chalk.yellow('You have local changes:'));
      for (const change of localChanges) {
        console.log(`  ${change.status}: ${change.path}`);
      }
      console.log();

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to overwrite local changes?',
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Pull cancelled');
        return;
      }
    }

    const spinner = ora('Fetching latest changes...').start();

    // Get collection files from API
    const response = await api.getCollectionFiles(config.remote.collectionId);

    if (response.error || !response.data) {
      spinner.fail('Failed to fetch files');
      console.error(chalk.red(response.error?.message || 'Unknown error'));
      process.exit(1);
    }

    const { files, commitSha, branch } = response.data;

    // Check if already up to date
    if (commitSha === index.commitSha) {
      spinner.succeed('Already up to date');
      return;
    }

    spinner.text = 'Updating files...';

    // Track current files in workspace
    const remoteFilePaths = new Set(files.map((f) => f.path));
    const localFilePaths = new Set(Object.keys(index.files));

    // Write/update files from remote
    const fileIndex: Record<string, { sha: string; mtime: string }> = {};
    const now = new Date().toISOString();

    let added = 0;
    let updated = 0;
    let deleted = 0;

    for (const file of files) {
      const filePath = join(workspaceRoot, file.path);
      const fileDir = dirname(filePath);

      // Create directory if needed
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }

      // Check if file is new or updated
      if (!localFilePaths.has(file.path)) {
        added++;
      } else if (index.files[file.path]?.sha !== file.sha) {
        updated++;
      }

      // Write file
      writeFileSync(filePath, file.content, 'utf-8');

      // Track in index
      fileIndex[file.path] = {
        sha: file.sha,
        mtime: now,
      };
    }

    // Delete files that no longer exist on remote
    for (const localPath of localFilePaths) {
      if (!remoteFilePaths.has(localPath)) {
        const filePath = join(workspaceRoot, localPath);

        if (existsSync(filePath)) {
          unlinkSync(filePath);
          deleted++;

          // Try to remove empty parent directories
          try {
            const parentDir = dirname(filePath);
            rmSync(parentDir, { recursive: true });
          } catch {
            // Directory not empty or other error, ignore
          }
        }
      }
    }

    // Update workspace index
    saveWorkspaceIndex(workspaceRoot, {
      commitSha,
      files: fileIndex,
    });

    // Update workspace config
    saveWorkspaceConfig(workspaceRoot, {
      ...config,
      branch,
      lastSync: now,
    });

    spinner.succeed('Updated to latest');

    // Show summary
    const changes = [];
    if (added > 0) changes.push(chalk.green(`${added} added`));
    if (updated > 0) changes.push(chalk.yellow(`${updated} updated`));
    if (deleted > 0) changes.push(chalk.red(`${deleted} deleted`));

    if (changes.length > 0) {
      console.log(chalk.gray(`  ${changes.join(', ')}`));
    }

    console.log(chalk.gray(`  Commit: ${index.commitSha.substring(0, 7)} → ${commitSha.substring(0, 7)}`));
  });
