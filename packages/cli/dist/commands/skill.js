import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import inquirer from 'inquirer';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { api } from '../lib/api.js';
import { findWorkspaceRoot, getWorkspaceConfig } from '../lib/config.js';
const SKILL_TEMPLATE = `---
name: {{name}}
description: {{description}}
user-invocable: true
allowed-tools: []
---

# {{displayName}}

Instructions for this skill...
`;
export const skillCommand = new Command('skill')
    .description('Manage skills');
// sdojo skill list [collection]
skillCommand
    .command('list [collection]')
    .description('List skills in a collection')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-l, --limit <number>', 'Results per page', '20')
    .option('-s, --search <query>', 'Search query')
    .option('--json', 'Output as JSON')
    .action(async (collection, options) => {
    let collectionId;
    let collectionPath;
    if (collection) {
        // Collection specified as argument
        const [accountSlug, collectionSlug] = collection.split('/');
        if (!accountSlug || !collectionSlug) {
            console.error(chalk.red('Invalid path. Use format: account/collection'));
            process.exit(1);
        }
        const response = await api.getCollectionBySlug(accountSlug, collectionSlug);
        if (response.error || !response.data) {
            console.error(chalk.red(response.error?.message || 'Collection not found'));
            process.exit(1);
        }
        collectionId = response.data.id;
        collectionPath = collection;
    }
    else {
        // Use current workspace
        const workspaceRoot = findWorkspaceRoot();
        if (!workspaceRoot) {
            console.error(chalk.red('No collection specified and not in a workspace'));
            console.error(chalk.gray('Either specify a collection or run from within a cloned workspace'));
            process.exit(1);
        }
        const config = getWorkspaceConfig(workspaceRoot);
        if (!config) {
            console.error(chalk.red('Invalid workspace configuration'));
            process.exit(1);
        }
        collectionId = config.remote.collectionId;
        collectionPath = `${config.remote.account}/${config.remote.collection}`;
    }
    const spinner = ora('Fetching skills...').start();
    const response = await api.listSkills(collectionId, {
        page: parseInt(options.page),
        limit: parseInt(options.limit),
        search: options.search,
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
    console.log(chalk.bold(collectionPath));
    console.log();
    if (items.length === 0) {
        console.log(chalk.yellow('No skills found'));
        return;
    }
    const table = new Table({
        head: [chalk.cyan('PATH'), chalk.cyan('NAME'), chalk.cyan('DESCRIPTION')],
        style: { head: [], border: [] },
        colWidths: [30, 25, 40],
        wordWrap: true,
    });
    for (const skill of items) {
        table.push([
            skill.path,
            skill.name,
            (skill.description || '').substring(0, 80),
        ]);
    }
    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${page} of ${totalPages} (${total} total)`));
});
// sdojo skill create <path>
skillCommand
    .command('create <path>')
    .description('Create a new skill from template')
    .option('-n, --name <name>', 'Skill name')
    .option('-d, --description <text>', 'Skill description')
    .action(async (path, options) => {
    const workspaceRoot = findWorkspaceRoot();
    if (!workspaceRoot) {
        console.error(chalk.red('Not in a SkillsDojo workspace'));
        console.error(chalk.gray('Run `sdojo clone <account/collection>` to clone a collection first'));
        process.exit(1);
    }
    // Normalize path
    const normalizedPath = path.replace(/\/$/, '');
    const skillDir = join(workspaceRoot, normalizedPath);
    const skillFile = join(skillDir, 'SKILL.md');
    // Check if skill already exists
    if (existsSync(skillFile)) {
        console.error(chalk.red(`Skill already exists at ${normalizedPath}`));
        process.exit(1);
    }
    // Get skill details
    let name = options.name;
    let description = options.description;
    if (!name) {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Skill name:',
                default: normalizedPath.split('/').pop(),
                validate: (input) => input.trim().length > 0 || 'Name is required',
            },
            {
                type: 'input',
                name: 'description',
                message: 'Description:',
            },
        ]);
        name = answers.name;
        description = answers.description;
    }
    // Create directory
    mkdirSync(skillDir, { recursive: true });
    // Generate SKILL.md content
    const displayName = name
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    const content = SKILL_TEMPLATE
        .replace(/\{\{name\}\}/g, name)
        .replace(/\{\{displayName\}\}/g, displayName)
        .replace(/\{\{description\}\}/g, description || 'TODO: Add description');
    // Write SKILL.md
    writeFileSync(skillFile, content, 'utf-8');
    console.log(chalk.green(`Created skill at ${normalizedPath}/SKILL.md`));
    console.log();
    console.log(chalk.gray('Edit the skill file, then run `sdojo push` to submit changes'));
});
// sdojo skill show <path>
skillCommand
    .command('show <path>')
    .description('Show skill details')
    .option('--json', 'Output as JSON')
    .action(async (path, options) => {
    // Check if we're in a workspace
    const workspaceRoot = findWorkspaceRoot();
    if (workspaceRoot) {
        // Show local skill
        const skillFile = join(workspaceRoot, path, 'SKILL.md');
        if (existsSync(skillFile)) {
            const { readFileSync } = await import('fs');
            const content = readFileSync(skillFile, 'utf-8');
            if (options.json) {
                // Parse YAML frontmatter
                const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
                let metadata = {};
                if (frontmatterMatch) {
                    const yaml = frontmatterMatch[1];
                    // Simple YAML parsing (key: value)
                    for (const line of yaml.split('\n')) {
                        const match = line.match(/^(\w[\w-]*): (.*)$/);
                        if (match) {
                            metadata[match[1]] = match[2];
                        }
                    }
                }
                console.log(JSON.stringify({ path, content, metadata }, null, 2));
            }
            else {
                console.log(chalk.bold(path));
                console.log(chalk.gray('─'.repeat(60)));
                console.log(content);
            }
            return;
        }
    }
    console.error(chalk.red(`Skill not found at ${path}`));
    process.exit(1);
});
// sdojo skill delete <path>
skillCommand
    .command('delete <path>')
    .description('Delete a skill')
    .option('-f, --force', 'Skip confirmation')
    .action(async (path, options) => {
    const workspaceRoot = findWorkspaceRoot();
    if (!workspaceRoot) {
        console.error(chalk.red('Not in a SkillsDojo workspace'));
        process.exit(1);
    }
    const skillDir = join(workspaceRoot, path);
    if (!existsSync(skillDir)) {
        console.error(chalk.red(`Skill not found at ${path}`));
        process.exit(1);
    }
    // Confirm deletion
    if (!options.force) {
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to delete ${chalk.red(path)}?`,
                default: false,
            },
        ]);
        if (!confirm) {
            console.log('Cancelled');
            return;
        }
    }
    // Delete directory
    rmSync(skillDir, { recursive: true });
    console.log(chalk.green(`Deleted ${path}`));
    console.log(chalk.gray('Run `sdojo push` to submit the deletion'));
});
// sdojo skill move <old-path> <new-path>
skillCommand
    .command('move <old-path> <new-path>')
    .description('Move/rename a skill')
    .action(async (oldPath, newPath) => {
    const workspaceRoot = findWorkspaceRoot();
    if (!workspaceRoot) {
        console.error(chalk.red('Not in a SkillsDojo workspace'));
        process.exit(1);
    }
    const oldDir = join(workspaceRoot, oldPath);
    const newDir = join(workspaceRoot, newPath);
    if (!existsSync(oldDir)) {
        console.error(chalk.red(`Skill not found at ${oldPath}`));
        process.exit(1);
    }
    if (existsSync(newDir)) {
        console.error(chalk.red(`Skill already exists at ${newPath}`));
        process.exit(1);
    }
    // Rename directory
    const { renameSync } = await import('fs');
    const { dirname } = await import('path');
    // Ensure parent directory exists
    mkdirSync(dirname(newDir), { recursive: true });
    renameSync(oldDir, newDir);
    console.log(chalk.green(`Moved ${oldPath} → ${newPath}`));
    console.log(chalk.gray('Run `sdojo push` to submit the change'));
});
//# sourceMappingURL=skill.js.map