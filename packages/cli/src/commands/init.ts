import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { saveWorkspaceConfig, saveWorkspaceIndex, WorkspaceConfig, WorkspaceIndex, getWorkspaceConfig } from '../lib/config.js';

export const initCommand = new Command('link')
  .description('Link current directory to a SkillsDojo collection')
  .argument('[collection]', 'Collection to link (account/collection)')
  .option('--create', 'Create the collection if it does not exist')
  .action(async (collectionPath, options) => {
    const creds = requireAuth();
    const cwd = process.cwd();

    // Check if already initialized
    if (getWorkspaceConfig(cwd)) {
      console.error(chalk.red('Directory is already a SkillsDojo workspace'));
      console.error(chalk.gray('Use `skillsd status` to see current state'));
      process.exit(1);
    }

    // If no collection specified, prompt for one
    if (!collectionPath) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: 'Link to existing collection', value: 'link' },
            { name: 'Create new collection', value: 'create' },
          ],
        },
      ]);

      if (action === 'create') {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'slug',
            message: 'Collection slug:',
            default: cwd.split('/').pop()?.toLowerCase().replace(/\s+/g, '-'),
            validate: (input) => /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(input) || input.length === 1
              ? true
              : 'Slug must be lowercase alphanumeric with hyphens',
          },
          {
            type: 'input',
            name: 'name',
            message: 'Collection name:',
            default: cwd.split('/').pop(),
          },
          {
            type: 'list',
            name: 'visibility',
            message: 'Visibility:',
            choices: ['private', 'public', 'unlisted'],
            default: 'private',
          },
        ]);

        const spinner = ora('Creating collection...').start();
        const response = await api.createCollection({
          slug: answers.slug,
          name: answers.name,
          visibility: answers.visibility,
        });

        if (response.error || !response.data) {
          spinner.fail('Failed to create collection');
          console.error(chalk.red(response.error?.message || 'Unknown error'));
          process.exit(1);
        }

        spinner.succeed(`Created collection ${chalk.green(answers.slug)}`);
        collectionPath = `${creds.account.slug}/${answers.slug}`;
      } else {
        // Link to existing
        const spinner = ora('Fetching your collections...').start();
        const response = await api.listCollections({ limit: 100 });

        if (response.error || !response.data) {
          spinner.fail('Failed to fetch collections');
          console.error(chalk.red(response.error?.message || 'Unknown error'));
          process.exit(1);
        }

        spinner.stop();

        if (response.data.items.length === 0) {
          console.log(chalk.yellow('No collections found'));
          console.log(chalk.gray('Run `skillsd init --create` to create one'));
          process.exit(1);
        }

        const { selected } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selected',
            message: 'Select a collection:',
            choices: response.data.items.map((c) => ({
              name: `${c.account?.slug}/${c.slug} (${c.visibility})`,
              value: `${c.account?.slug}/${c.slug}`,
            })),
          },
        ]);

        collectionPath = selected;
      }
    }

    const [accountSlug, collectionSlug] = collectionPath.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const spinner = ora('Linking to collection...').start();

    // Get collection by slug
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (collResponse.error || !collResponse.data) {
      if (options.create) {
        // Create the collection
        spinner.text = 'Creating collection...';
        const createResponse = await api.createCollection({
          slug: collectionSlug,
          name: collectionSlug,
          visibility: 'private',
        });

        if (createResponse.error || !createResponse.data) {
          spinner.fail('Failed to create collection');
          console.error(chalk.red(createResponse.error?.message || 'Unknown error'));
          process.exit(1);
        }

        // Update collectionPath with actual account
        collectionPath = `${createResponse.data.account?.slug}/${collectionSlug}`;

        // Re-fetch to get full data
        const refetch = await api.getCollectionBySlug(
          createResponse.data.account?.slug || accountSlug,
          collectionSlug
        );

        if (refetch.data) {
          initWorkspace(cwd, refetch.data, collectionPath, spinner);
        } else {
          initWorkspace(cwd, createResponse.data, collectionPath, spinner);
        }
        return;
      }

      spinner.fail('Collection not found');
      console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
      console.error(chalk.gray('Use --create to create it'));
      process.exit(1);
    }

    initWorkspace(cwd, collResponse.data, collectionPath, spinner);
  });

function initWorkspace(
  cwd: string,
  collection: { id: string; account?: { slug: string } },
  collectionPath: string,
  spinner: ReturnType<typeof ora>
) {
  const [accountSlug, collectionSlug] = collectionPath.split('/');

  // Create .skillsdojo directory
  const sdojoDir = join(cwd, '.skillsdojo');
  if (!existsSync(sdojoDir)) {
    mkdirSync(sdojoDir, { recursive: true });
  }

  // Create .agents/skills directory if it doesn't exist
  const skillsDir = join(cwd, '.agents', 'skills');
  if (!existsSync(skillsDir)) {
    mkdirSync(skillsDir, { recursive: true });
  }

  // Save workspace config
  const config: WorkspaceConfig = {
    remote: {
      url: `https://skillsdojo.ai/${accountSlug}/${collectionSlug}`,
      account: accountSlug,
      collection: collectionSlug,
      collectionId: collection.id,
    },
    branch: 'main',
    lastSync: new Date().toISOString(),
  };

  saveWorkspaceConfig(cwd, config);

  // Save empty index (no files synced yet)
  const index: WorkspaceIndex = {
    commitSha: '',
    files: {},
  };

  saveWorkspaceIndex(cwd, index);

  spinner.succeed(`Initialized SkillsDojo workspace`);

  console.log();
  console.log(chalk.gray(`  Collection: ${collectionPath}`));
  console.log(chalk.gray(`  Skills dir: .agents/skills/`));
  console.log();
  console.log('Next steps:');
  console.log(chalk.cyan('  npx skills add <owner/repo@skill>') + ' - Add skills from skills.sh');
  console.log(chalk.cyan('  skillsd status') + '                  - See changes');
  console.log(chalk.cyan('  skillsd push') + '                    - Push to SkillsDojo');
}
