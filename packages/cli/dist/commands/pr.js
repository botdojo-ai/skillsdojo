import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import inquirer from 'inquirer';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { findWorkspaceRoot, getWorkspaceConfig } from '../lib/config.js';
export const prCommand = new Command('pr')
    .description('Manage pull requests');
// Helper to get collection ID from args or workspace
async function getCollectionId(collection) {
    if (collection) {
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
        return { id: response.data.id, path: collection };
    }
    // Use current workspace
    const workspaceRoot = findWorkspaceRoot();
    if (!workspaceRoot) {
        console.error(chalk.red('No collection specified and not in a workspace'));
        process.exit(1);
    }
    const config = getWorkspaceConfig(workspaceRoot);
    if (!config) {
        console.error(chalk.red('Invalid workspace configuration'));
        process.exit(1);
    }
    return {
        id: config.remote.collectionId,
        path: `${config.remote.account}/${config.remote.collection}`,
    };
}
// sdojo pr list [collection]
prCommand
    .command('list [collection]')
    .description('List pull requests')
    .option('-s, --state <state>', 'Filter by state (open, merged, closed)', 'open')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-l, --limit <number>', 'Results per page', '20')
    .option('--json', 'Output as JSON')
    .action(async (collection, options) => {
    requireAuth();
    const { id: collectionId, path: collectionPath } = await getCollectionId(collection);
    const spinner = ora('Fetching pull requests...').start();
    const response = await api.listPullRequests(collectionId, {
        page: parseInt(options.page),
        limit: parseInt(options.limit),
        status: options.state,
    });
    if (response.error || !response.data) {
        spinner.fail('Failed to fetch pull requests');
        console.error(chalk.red(response.error?.message || 'Unknown error'));
        process.exit(1);
    }
    spinner.stop();
    const { items, total, page, totalPages } = response.data;
    if (options.json) {
        console.log(JSON.stringify(response.data, null, 2));
        return;
    }
    console.log(chalk.bold(`${collectionPath} - Pull Requests`));
    console.log();
    if (items.length === 0) {
        console.log(chalk.yellow(`No ${options.state} pull requests`));
        return;
    }
    const table = new Table({
        head: [chalk.cyan('#'), chalk.cyan('TITLE'), chalk.cyan('STATUS'), chalk.cyan('CREATED')],
        style: { head: [], border: [] },
        colWidths: [8, 45, 12, 15],
        wordWrap: true,
    });
    for (const pr of items) {
        const statusColor = pr.status === 'open' ? chalk.green : pr.status === 'merged' ? chalk.magenta : chalk.red;
        table.push([
            `#${pr.number}`,
            pr.title,
            statusColor(pr.status),
            new Date(pr.createdAt).toLocaleDateString(),
        ]);
    }
    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${page} of ${totalPages} (${total} total)`));
});
// sdojo pr view <number> [collection]
prCommand
    .command('view <number> [collection]')
    .description('View pull request details')
    .option('--json', 'Output as JSON')
    .action(async (number, collection, options) => {
    requireAuth();
    const { id: collectionId, path: collectionPath } = await getCollectionId(collection);
    const prNumber = parseInt(number);
    const spinner = ora('Fetching pull request...').start();
    const response = await api.getPullRequest(collectionId, prNumber);
    if (response.error || !response.data) {
        spinner.fail('Pull request not found');
        console.error(chalk.red(response.error?.message || 'Pull request not found'));
        process.exit(1);
    }
    spinner.stop();
    const pr = response.data;
    if (options.json) {
        console.log(JSON.stringify(pr, null, 2));
        return;
    }
    const statusColor = pr.status === 'open' ? chalk.green : pr.status === 'merged' ? chalk.magenta : chalk.red;
    console.log(chalk.bold(`#${pr.number}: ${pr.title}`));
    console.log();
    console.log(`Status: ${statusColor(pr.status)}`);
    console.log(`Branch: ${pr.sourceBranch} → ${pr.targetBranch}`);
    console.log(`Created: ${new Date(pr.createdAt).toLocaleString()}`);
    if (pr.description) {
        console.log();
        console.log(pr.description);
    }
    if (pr.files && pr.files.length > 0) {
        console.log();
        console.log(chalk.bold('Files changed:'));
        for (const file of pr.files) {
            const actionIcon = file.action === 'create' ? chalk.green('+') : file.action === 'delete' ? chalk.red('-') : chalk.yellow('~');
            console.log(`  ${actionIcon} ${file.path}`);
        }
    }
    console.log();
    console.log(chalk.gray(`${collectionPath}/pull/${pr.number}`));
});
// sdojo pr merge <number> [collection]
prCommand
    .command('merge <number> [collection]')
    .description('Merge a pull request')
    .option('-f, --force', 'Skip confirmation')
    .option('--allow-deletions', 'Allow skill deletions')
    .action(async (number, collection, options) => {
    requireAuth();
    const { id: collectionId, path: collectionPath } = await getCollectionId(collection);
    const prNumber = parseInt(number);
    // Get PR details first
    const prResponse = await api.getPullRequest(collectionId, prNumber);
    if (prResponse.error || !prResponse.data) {
        console.error(chalk.red(prResponse.error?.message || 'Pull request not found'));
        process.exit(1);
    }
    const pr = prResponse.data;
    if (pr.status !== 'open') {
        console.error(chalk.red(`Cannot merge: PR is ${pr.status}`));
        process.exit(1);
    }
    // Confirm merge
    if (!options.force) {
        console.log(chalk.bold(`#${pr.number}: ${pr.title}`));
        console.log();
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: 'Merge this pull request?',
                default: true,
            },
        ]);
        if (!confirm) {
            console.log('Cancelled');
            return;
        }
    }
    const spinner = ora('Merging pull request...').start();
    const response = await api.mergePullRequest(collectionId, prNumber, {
        allowDeletions: options.allowDeletions,
    });
    if (response.error) {
        spinner.fail('Failed to merge');
        console.error(chalk.red(response.error.message));
        // Show deleted skills if that's the issue
        const errorData = response.error;
        if (errorData.deletedSkills && errorData.deletedSkills.length > 0) {
            console.log();
            console.log(chalk.yellow('Skills that would be deleted:'));
            for (const skill of errorData.deletedSkills) {
                console.log(`  - ${skill}`);
            }
            console.log();
            console.log(chalk.gray('Use --allow-deletions to confirm'));
        }
        process.exit(1);
    }
    spinner.succeed(`Merged PR #${prNumber}`);
});
// sdojo pr close <number> [collection]
prCommand
    .command('close <number> [collection]')
    .description('Close a pull request without merging')
    .option('-f, --force', 'Skip confirmation')
    .action(async (number, collection, options) => {
    requireAuth();
    const { id: collectionId } = await getCollectionId(collection);
    const prNumber = parseInt(number);
    // Confirm close
    if (!options.force) {
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Close PR #${prNumber} without merging?`,
                default: false,
            },
        ]);
        if (!confirm) {
            console.log('Cancelled');
            return;
        }
    }
    const spinner = ora('Closing pull request...').start();
    const response = await api.closePullRequest(collectionId, prNumber);
    if (response.error) {
        spinner.fail('Failed to close');
        console.error(chalk.red(response.error.message));
        process.exit(1);
    }
    spinner.succeed(`Closed PR #${prNumber}`);
});
//# sourceMappingURL=pr.js.map