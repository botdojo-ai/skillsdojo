import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { saveWorkspaceConfig, saveWorkspaceIndex, WorkspaceConfig, WorkspaceIndex } from '../lib/config.js';

export const cloneCommand = new Command('clone')
  .description('Clone a collection to work on locally')
  .argument('<collection>', 'Collection to clone (account/collection)')
  .option('-b, --branch <name>', 'Branch to clone', 'main')
  .option('-d, --directory <path>', 'Directory to clone into')
  .action(async (collectionPath, options) => {
    requireAuth();

    const [accountSlug, collectionSlug] = collectionPath.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const targetDir = options.directory || collectionSlug;

    if (existsSync(targetDir)) {
      console.error(chalk.red(`Directory '${targetDir}' already exists`));
      process.exit(1);
    }

    const spinner = ora('Fetching collection...').start();

    // Get collection by slug
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (collResponse.error || !collResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    const collection = collResponse.data;

    spinner.text = 'Fetching files...';

    // Get collection files
    const filesResponse = await api.getCollectionFiles(collection.id);

    if (filesResponse.error || !filesResponse.data) {
      spinner.fail('Failed to fetch files');
      console.error(chalk.red(filesResponse.error?.message || 'Failed to fetch files'));
      process.exit(1);
    }

    const { files, commitSha, branch } = filesResponse.data;

    spinner.text = 'Creating workspace...';

    // Create directory structure
    mkdirSync(targetDir, { recursive: true });
    mkdirSync(join(targetDir, '.skillsdojo'), { recursive: true });

    // Write files
    const indexFiles: WorkspaceIndex['files'] = {};

    for (const file of files) {
      const filePath = join(targetDir, file.path);
      const fileDir = join(targetDir, file.path.split('/').slice(0, -1).join('/'));

      if (fileDir !== targetDir) {
        mkdirSync(fileDir, { recursive: true });
      }

      writeFileSync(filePath, file.content);

      indexFiles[file.path] = {
        sha: file.sha,
        mtime: new Date().toISOString(),
      };
    }

    // Save workspace config
    const config: WorkspaceConfig = {
      remote: {
        url: `https://skillsdojo.ai/${accountSlug}/${collectionSlug}`,
        account: accountSlug,
        collection: collectionSlug,
        collectionId: collection.id,
      },
      branch: branch || options.branch,
      lastSync: new Date().toISOString(),
    };

    saveWorkspaceConfig(targetDir, config);

    // Save index
    const index: WorkspaceIndex = {
      commitSha,
      files: indexFiles,
    };

    saveWorkspaceIndex(targetDir, index);

    spinner.succeed(`Cloned ${chalk.green(collectionPath)} to ${chalk.cyan(targetDir)}`);

    console.log();
    console.log(chalk.gray(`  Branch: ${branch || options.branch}`));
    console.log(chalk.gray(`  Files: ${files.length}`));
    console.log();
    console.log(`cd ${targetDir} to start working`);
  });
