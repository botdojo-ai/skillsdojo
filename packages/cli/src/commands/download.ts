import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createWriteStream, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { findWorkspaceRoot, getWorkspaceConfig } from '../lib/config.js';

export const downloadCommand = new Command('download')
  .description('Download a collection or skills as a zip file')
  .argument('[collection]', 'Collection to download (account/collection)')
  .option('-o, --output <path>', 'Output file path')
  .option('-s, --skills <paths>', 'Comma-separated skill paths to download')
  .option('-b, --branch <name>', 'Branch to download from', 'main')
  .option('--overwrite', 'Overwrite existing file without confirmation')
  .option('--json', 'Output as JSON')
  .action(async (collection, options) => {
    requireAuth();

    let collectionId: string;
    let collectionPath: string;
    let outputPath: string;

    // Determine collection (from arg or workspace)
    if (collection) {
      const [accountSlug, collectionSlug] = collection.split('/');

      if (!accountSlug || !collectionSlug) {
        console.error(chalk.red('Invalid collection path. Use format: account/collection'));
        process.exit(1);
      }

      // Get collection ID from API
      const response = await api.getCollectionBySlug(accountSlug, collectionSlug);

      if (response.error || !response.data) {
        console.error(chalk.red(response.error?.message || 'Collection not found'));
        process.exit(1);
      }

      collectionId = response.data.id;
      collectionPath = collection;

      // Default output path
      outputPath = options.output || `./${collectionSlug}.zip`;
    } else {
      // Use current workspace
      const workspaceRoot = findWorkspaceRoot();

      if (!workspaceRoot) {
        console.error(chalk.red('No collection specified and not in a workspace'));
        console.error(chalk.gray('Usage: sdojo download <account/collection>'));
        process.exit(1);
      }

      const config = getWorkspaceConfig(workspaceRoot);

      if (!config) {
        console.error(chalk.red('Invalid workspace configuration'));
        process.exit(1);
      }

      collectionId = config.remote.collectionId;
      collectionPath = `${config.remote.account}/${config.remote.collection}`;

      // Default output path
      outputPath = options.output || `./${config.remote.collection}.zip`;
    }

    // Check if output file exists
    if (existsSync(outputPath) && !options.overwrite) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `File ${outputPath} already exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.yellow('Download cancelled'));
        return;
      }
    }

    const spinner = ora('Requesting download token...').start();

    // Parse skill paths if provided
    const skillPaths = options.skills
      ? options.skills.split(',').map((s: string) => s.trim())
      : undefined;

    // Request download token
    let tokenResponse;

    try {
      if (skillPaths && skillPaths.length > 0) {
        tokenResponse = await api.requestSkillsDownloadToken(collectionId, {
          skillPaths,
          branch: options.branch,
        });
      } else {
        tokenResponse = await api.requestDownloadToken(collectionId, {
          branch: options.branch,
        });
      }

      if (tokenResponse.error || !tokenResponse.data) {
        spinner.fail('Failed to request download');
        console.error(chalk.red(tokenResponse.error?.message || 'Unknown error'));
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Failed to request download');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }

    const { downloadToken, expiresAt } = tokenResponse.data;
    const estimatedSizeMB = 'estimatedSizeMB' in tokenResponse.data ? tokenResponse.data.estimatedSizeMB : undefined;

    spinner.text = `Downloading ${collectionPath}...`;

    if (estimatedSizeMB) {
      spinner.text += ` (estimated ${estimatedSizeMB}MB)`;
    }

    // Download the zip file
    try {
      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (outputDir !== '.' && outputDir !== '') {
        await mkdir(outputDir, { recursive: true });
      }

      await api.downloadZip(collectionId, downloadToken, outputPath);

      spinner.succeed(`Downloaded to ${chalk.cyan(outputPath)}`);

      if (!options.json) {
        console.log();
        console.log(chalk.gray(`Collection: ${collectionPath}`));
        if (skillPaths) {
          console.log(chalk.gray(`Skills: ${skillPaths.join(', ')}`));
        }
        console.log(chalk.gray(`Branch: ${options.branch}`));
        console.log(chalk.gray(`Token expires: ${new Date(expiresAt).toLocaleString()}`));
      } else {
        console.log(
          JSON.stringify(
            {
              success: true,
              outputPath,
              collection: collectionPath,
              skills: skillPaths,
              branch: options.branch,
            },
            null,
            2
          )
        );
      }
    } catch (error) {
      spinner.fail('Download failed');
      console.error(chalk.red(error instanceof Error ? error.message : 'Unknown error'));
      process.exit(1);
    }
  });
