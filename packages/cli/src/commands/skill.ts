import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'fs';
import { basename, join, dirname } from 'path';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';

export const skillCommand = new Command('skill')
  .description('Manage skills in collections');

// skillsd skill list <collection>
skillCommand
  .command('list <collection>')
  .description('List skills in a collection')
  .option('-p, --page <number>', 'Page number', '1')
  .option('-l, --limit <number>', 'Results per page', '50')
  .option('--json', 'Output as JSON')
  .action(async (collectionPath, options) => {
    const [accountSlug, collectionSlug] = collectionPath.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid path. Use format: account/collection'));
      process.exit(1);
    }

    const spinner = ora('Fetching skills...').start();

    // Get collection first
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);
    if (collResponse.error || !collResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    const response = await api.listSkills(collResponse.data.id, {
      page: parseInt(options.page),
      limit: parseInt(options.limit),
    });

    if (response.error || !response.data) {
      spinner.fail('Failed to fetch skills');
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
      console.log(chalk.yellow('No skills found in this collection'));
      console.log(chalk.gray(`Run \`skillsd skill create ${collectionPath} <path>\` to add one`));
      return;
    }

    const table = new Table({
      head: [
        chalk.cyan('PATH'),
        chalk.cyan('NAME'),
        chalk.cyan('DESCRIPTION'),
      ],
      style: { head: [], border: [] },
      colWidths: [25, 25, 40],
      wordWrap: true,
    });

    for (const skill of items) {
      table.push([
        skill.path,
        skill.name,
        skill.description || chalk.gray('(no description)'),
      ]);
    }

    console.log(chalk.bold(`Skills in ${collectionPath}\n`));
    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${page} of ${totalPages} (${total} total)`));
  });

// skillsd skill create <collection> <path>
skillCommand
  .command('create <collection> [path]')
  .description('Create a new skill in a collection')
  .option('-n, --name <name>', 'Skill name')
  .option('-d, --description <text>', 'Skill description')
  .option('-f, --file <path>', 'Read skill content from SKILL.md file')
  .action(async (collectionPath, skillPath, options) => {
    requireAuth();

    const [accountSlug, collectionSlug] = collectionPath.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid collection path. Use format: account/collection'));
      process.exit(1);
    }

    // Get collection first
    const spinner = ora('Finding collection...').start();
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (collResponse.error || !collResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    spinner.stop();

    let name = options.name;
    let description = options.description;
    let content: string | undefined;

    // If file is provided, read from it
    if (options.file) {
      const filePath = options.file;
      if (!existsSync(filePath)) {
        console.error(chalk.red(`File not found: ${filePath}`));
        process.exit(1);
      }

      content = readFileSync(filePath, 'utf-8');

      // Parse frontmatter if present
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1];
        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

        if (nameMatch && !name) name = nameMatch[1].trim();
        if (descMatch && !description) description = descMatch[1].trim();
      }

      // Derive skill path from file path if not provided
      if (!skillPath) {
        const dir = dirname(filePath);
        skillPath = basename(dir);
        if (skillPath === '.' || skillPath === '') {
          skillPath = basename(filePath, '.md').toLowerCase().replace(/skill\.?/gi, '').replace(/\s+/g, '-') || 'new-skill';
        }
      }
    }

    // Interactive prompts if needed
    if (!skillPath) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'path',
          message: 'Skill path (e.g., my-skill):',
          validate: (input) => {
            if (!input) return 'Path is required';
            if (!/^[a-z0-9][a-z0-9-/]*[a-z0-9]$/.test(input) && input.length > 1) {
              return 'Path must be lowercase alphanumeric with hyphens';
            }
            return true;
          },
        },
      ]);
      skillPath = answers.path;
    }

    if (!name) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Skill name:',
          default: skillPath.split('/').pop()?.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
          validate: (input) => input ? true : 'Name is required',
        },
      ]);
      name = answers.name;
    }

    if (!description) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: 'Description (optional):',
        },
      ]);
      description = answers.description || undefined;
    }

    const createSpinner = ora('Creating skill...').start();

    const response = await api.createSkill(collResponse.data.id, {
      path: skillPath,
      name,
      description,
      content: content || '',
    });

    if (response.error || !response.data) {
      createSpinner.fail('Failed to create skill');
      console.error(chalk.red(response.error?.message || 'Unknown error'));
      process.exit(1);
    }

    createSpinner.succeed(`Created skill ${chalk.green(skillPath)} in ${collectionPath}`);
  });

// skillsd skill delete <collection> <path>
skillCommand
  .command('delete <collection> <path>')
  .description('Delete a skill from a collection')
  .option('-f, --force', 'Skip confirmation')
  .action(async (collectionPath, skillPath, options) => {
    requireAuth();

    const [accountSlug, collectionSlug] = collectionPath.split('/');

    if (!accountSlug || !collectionSlug) {
      console.error(chalk.red('Invalid collection path. Use format: account/collection'));
      process.exit(1);
    }

    // Get collection first
    const spinner = ora('Finding skill...').start();
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);

    if (collResponse.error || !collResponse.data) {
      spinner.fail('Collection not found');
      console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
      process.exit(1);
    }

    // List skills to find the one with matching path
    const skillsResponse = await api.listSkills(collResponse.data.id, { limit: 100 });

    if (skillsResponse.error || !skillsResponse.data) {
      spinner.fail('Failed to fetch skills');
      console.error(chalk.red(skillsResponse.error?.message || 'Unknown error'));
      process.exit(1);
    }

    const skill = skillsResponse.data.items.find(s => s.path === skillPath);

    if (!skill) {
      spinner.fail(`Skill not found: ${skillPath}`);
      process.exit(1);
    }

    spinner.stop();

    // Confirm deletion
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete ${chalk.red(skillPath)}? This action cannot be undone.`,
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Cancelled');
        return;
      }
    }

    const deleteSpinner = ora('Deleting skill...').start();
    const deleteResponse = await api.deleteSkill(collResponse.data.id, skill.id);

    if (deleteResponse.error) {
      deleteSpinner.fail('Failed to delete skill');
      console.error(chalk.red(deleteResponse.error.message));
      process.exit(1);
    }

    deleteSpinner.succeed(`Deleted ${chalk.red(skillPath)} from ${collectionPath}`);
  });
