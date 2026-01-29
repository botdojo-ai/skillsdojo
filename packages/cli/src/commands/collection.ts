import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import inquirer from 'inquirer';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { getConfig } from '../lib/config.js';

export const collectionCommand = new Command('collection')
  .description('Manage skill collections');

// sdojo collection list
collectionCommand
  .command('list')
  .description('List your collections')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '20')
  .option('-v, --visibility <type>', 'Filter by visibility (public, private, unlisted)')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    requireAuth();

    const spinner = ora('Fetching collections...').start();

    const response = await api.listCollections({
      page: parseInt(options.page),
      limit: parseInt(options.limit),
      visibility: options.visibility,
    });

    if (response.error || !response.data) {
      spinner.fail('Failed to fetch collections');
      console.error(chalk.red(response.error?.message || 'Unknown error'));
      process.exit(1);
    }

    spinner.stop();

    const { items, total, page, totalPages } = response.data;

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }

    if (items.length === 0) {
      console.log(chalk.yellow('No collections found'));
      console.log(chalk.gray('Run `sdojo collection create <name>` to create one'));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan('NAME'),
        chalk.cyan('VISIBILITY'),
        chalk.cyan('SKILLS'),
        chalk.cyan('STARS'),
        chalk.cyan('FORKS'),
      ],
      style: { head: [], border: [] },
    });

    for (const collection of items) {
      const accountSlug = collection.account?.slug || 'unknown';
      table.push([
        `${accountSlug}/${collection.slug}`,
        collection.visibility,
        collection.skillCount.toString(),
        collection.starCount.toString(),
        collection.forkCount.toString(),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${page} of ${totalPages} (${total} total)`));
  });

// sdojo collection create <name>
collectionCommand
  .command('create <name>')
  .description('Create a new collection')
  .option('-d, --description <text>', 'Collection description')
  .option('-v, --visibility <type>', 'Visibility (public, private, unlisted)', 'private')
  .option('-s, --slug <slug>', 'Custom slug (default: derived from name)')
  .action(async (name, options) => {
    requireAuth();

    const spinner = ora('Creating collection...').start();

    const response = await api.createCollection({
      name,
      slug: options.slug,
      description: options.description,
      visibility: options.visibility,
    });

    if (response.error || !response.data) {
      spinner.fail('Failed to create collection');
      console.error(chalk.red(response.error?.message || 'Unknown error'));
      process.exit(1);
    }

    const collection = response.data;
    spinner.succeed(`Created collection ${chalk.green(collection.slug)}`);

    console.log(chalk.gray(`\nClone with: sdojo clone ${collection.account?.slug || 'you'}/${collection.slug}`));
  });

// sdojo collection fork <account/collection>
collectionCommand
  .command('fork <path>')
  .description('Fork a public collection to your account')
  .action(async (path) => {
    requireAuth();

    const [accountSlug, collectionSlug] = path.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const spinner = ora('Forking collection...').start();

    // First get the collection by slug
    const getResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (getResponse.error || !getResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(getResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    // Then fork it
    const forkResponse = await api.forkCollection(getResponse.data.id);

    if (forkResponse.error || !forkResponse.data) {
      spinner.fail('Failed to fork collection');
      console.error(chalk.red(forkResponse.error?.message || 'Unknown error'));
      process.exit(1);
    }

    const forked = forkResponse.data;
    spinner.succeed(`Forked to ${chalk.green(forked.account?.slug + '/' + forked.slug)}`);

    console.log(chalk.gray(`\nClone with: sdojo clone ${forked.account?.slug}/${forked.slug}`));
  });

// sdojo collection delete <name>
collectionCommand
  .command('delete <path>')
  .description('Delete/archive a collection')
  .option('-f, --force', 'Skip confirmation')
  .action(async (path, options) => {
    requireAuth();

    const [accountSlug, collectionSlug] = path.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    // Get collection first
    const spinner = ora('Finding collection...').start();
    const getResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (getResponse.error || !getResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(getResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    spinner.stop();

    // Confirm deletion
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete ${chalk.red(path)}? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Cancelled');
        return;
      }
    }

    const deleteSpinner = ora('Deleting collection...').start();
    const deleteResponse = await api.deleteCollection(getResponse.data.id);

    if (deleteResponse.error) {
      deleteSpinner.fail('Failed to delete collection');
      console.error(chalk.red(deleteResponse.error.message));
      process.exit(1);
    }

    deleteSpinner.succeed(`Deleted ${chalk.red(path)}`);
  });

// sdojo collection show <path>
collectionCommand
  .command('show <path>')
  .description('Show collection details')
  .option('--json', 'Output as JSON')
  .action(async (path, options) => {
    const [accountSlug, collectionSlug] = path.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const spinner = ora('Fetching collection...').start();
    const response = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (response.error || !response.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(response.error?.message || 'Collection not found'));
      process.exit(1);
    }

    spinner.stop();

    if (options.json) {
      console.log(JSON.stringify(response.data, null, 2));
      return;
    }

    const collection = response.data;

    console.log(chalk.bold(`${accountSlug}/${collection.slug}`));
    console.log();

    if (collection.description) {
      console.log(collection.description);
      console.log();
    }

    console.log(`${chalk.gray('Visibility:')} ${collection.visibility}`);
    console.log(`${chalk.gray('Skills:')} ${collection.skillCount}`);
    console.log(`${chalk.gray('Stars:')} ${collection.starCount}`);
    console.log(`${chalk.gray('Forks:')} ${collection.forkCount}`);

    if (collection.forkedFromId) {
      console.log(`${chalk.gray('Forked from:')} ${collection.forkedFromId}`);
    }

    console.log();
    console.log(chalk.gray(`Created: ${new Date(collection.createdAt).toLocaleDateString()}`));
    console.log(chalk.gray(`Updated: ${new Date(collection.modifiedAt).toLocaleDateString()}`));
  });
