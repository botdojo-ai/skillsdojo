import { Command } from 'commander';
import chalk from 'chalk';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { findWorkspaceRoot, getWorkspaceConfig, getWorkspaceIndex } from '../lib/config.js';

export interface FileChange {
  path: string;
  status: 'modified' | 'new' | 'deleted';
}

export function getWorkspaceChanges(workspaceRoot: string): FileChange[] {
  const index = getWorkspaceIndex(workspaceRoot);
  const changes: FileChange[] = [];

  if (!index) {
    return changes;
  }

  const trackedFiles = new Set(Object.keys(index.files));
  const currentFiles = new Set<string>();

  // Walk directory and find all SKILL.md files and other relevant files
  function walkDir(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = relative(workspaceRoot, fullPath);

      // Skip .skillsdojo directory
      if (entry.name === '.skillsdojo') {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        // Track all files (not just SKILL.md)
        currentFiles.add(relativePath);
      }
    }
  }

  walkDir(workspaceRoot);

  // Check for new and modified files
  for (const filePath of currentFiles) {
    const fullPath = join(workspaceRoot, filePath);

    if (!trackedFiles.has(filePath)) {
      // New file
      changes.push({ path: filePath, status: 'new' });
    } else {
      // Check if modified by comparing SHA (git-format: "blob <size>\0<content>")
      const content = readFileSync(fullPath);
      const header = `blob ${content.length}\0`;
      const store = Buffer.concat([Buffer.from(header), content]);
      const sha = createHash('sha1').update(store).digest('hex');

      if (sha !== index.files[filePath].sha) {
        changes.push({ path: filePath, status: 'modified' });
      }
    }
  }

  // Check for deleted files
  for (const trackedPath of trackedFiles) {
    if (!currentFiles.has(trackedPath)) {
      changes.push({ path: trackedPath, status: 'deleted' });
    }
  }

  // Sort changes by path
  changes.sort((a, b) => a.path.localeCompare(b.path));

  return changes;
}

export const statusCommand = new Command('status')
  .description('Show workspace status')
  .option('--json', 'Output as JSON')
  .action((options) => {
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

    if (options.json) {
      console.log(JSON.stringify({
        workspace: workspaceRoot,
        collection: `${config.remote.account}/${config.remote.collection}`,
        branch: config.branch,
        commitSha: index.commitSha,
        changes,
      }, null, 2));
      return;
    }

    console.log(`Collection: ${chalk.cyan(`${config.remote.account}/${config.remote.collection}`)}`);
    console.log(`Branch: ${chalk.gray(config.branch)}`);
    console.log();

    if (changes.length === 0) {
      console.log(chalk.green('Working directory clean'));
      return;
    }

    console.log('Changes not yet pushed:');
    console.log();

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
    console.log(chalk.gray("Run 'sdojo push' to create a pull request with these changes."));
  });
