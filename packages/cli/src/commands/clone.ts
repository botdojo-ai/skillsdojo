import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { api } from '../lib/api.js';
import { saveWorkspaceConfig, saveWorkspaceIndex, getApiUrl } from '../lib/config.js';

export const cloneCommand = new Command('clone')
  .description('Clone a skill collection to local workspace')
  .argument('<path>', 'Collection path (account/collection)')
  .argument('[directory]', 'Target directory (default: collection name)')
  .action(async (path, directory) => {
    const [accountSlug, collectionSlug] = path.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const targetDir = directory || collectionSlug;

    // Check if directory exists
    if (existsSync(targetDir)) {
      console.error(chalk.red(`Directory '${targetDir}' already exists`));
      process.exit(1);
    }

    const spinner = ora(`Cloning ${chalk.cyan(path)}...`).start();

    // Get collection by slug
    const collectionResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (collectionResponse.error || !collectionResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(collectionResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    const collection = collectionResponse.data;

    // Get collection files
    spinner.text = 'Fetching files...';
    const filesResponse = await api.getCollectionFiles(collection.id);

    if (filesResponse.error || !filesResponse.data) {
      spinner.fail('Failed to fetch files');
      console.error(chalk.red(filesResponse.error?.message || 'Failed to fetch files'));
      process.exit(1);
    }

    const { files, commitSha, branch } = filesResponse.data;

    // Create directory structure
    spinner.text = 'Writing files...';
    mkdirSync(targetDir, { recursive: true });

    // Write each file
    const fileIndex: Record<string, { sha: string; mtime: string }> = {};
    const now = new Date().toISOString();

    for (const file of files) {
      const filePath = join(targetDir, file.path);
      const fileDir = dirname(filePath);

      // Create directory if needed
      if (!existsSync(fileDir)) {
        mkdirSync(fileDir, { recursive: true });
      }

      // Write file
      writeFileSync(filePath, file.content, 'utf-8');

      // Track in index
      fileIndex[file.path] = {
        sha: file.sha,
        mtime: now,
      };
    }

    // Save workspace config
    saveWorkspaceConfig(targetDir, {
      remote: {
        url: getApiUrl(),
        account: accountSlug,
        collection: collectionSlug,
        collectionId: collection.id,
      },
      branch,
      lastSync: now,
    });

    // Save file index
    saveWorkspaceIndex(targetDir, {
      commitSha,
      files: fileIndex,
    });

    spinner.succeed(`Cloned ${chalk.green(path)} into ${chalk.cyan(targetDir)}`);
    console.log(chalk.gray(`\n  ${files.length} files`));
    console.log(chalk.gray(`  Branch: ${branch}`));
    console.log(chalk.gray(`  Commit: ${commitSha.substring(0, 7)}`));
    console.log();
    console.log(`cd ${targetDir}`);
  });
