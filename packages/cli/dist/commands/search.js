import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { api } from '../lib/api.js';
export const searchCommand = new Command('search')
    .description('Search public skills')
    .argument('<query>', 'Search query')
    .option('-p, --page <number>', 'Page number', '1')
    .option('-l, --limit <number>', 'Results per page', '20')
    .option('--json', 'Output as JSON')
    .action(async (query, options) => {
    const spinner = ora(`Searching for "${query}"...`).start();
    const response = await api.searchPublicSkills(query, {
        page: parseInt(options.page),
        limit: parseInt(options.limit),
    });
    if (response.error || !response.data) {
        spinner.fail('Search failed');
        console.error(chalk.red(response.error?.message || 'Unknown error'));
        process.exit(1);
    }
    spinner.stop();
    const { skills, pagination } = response.data;
    const { total, page, totalPages } = pagination;
    if (options.json) {
        console.log(JSON.stringify(response.data, null, 2));
        return;
    }
    console.log(chalk.bold(`Search results for "${query}"`));
    console.log();
    if (skills.length === 0) {
        console.log(chalk.yellow('No skills found'));
        return;
    }
    const table = new Table({
        head: [chalk.cyan('SKILL'), chalk.cyan('DESCRIPTION')],
        style: { head: [], border: [] },
        colWidths: [45, 50],
        wordWrap: true,
    });
    for (const skill of skills) {
        table.push([
            skill.fullPath,
            (skill.description || '').substring(0, 100),
        ]);
    }
    console.log(table.toString());
    console.log(chalk.gray(`\nPage ${page} of ${totalPages} (${total} total)`));
    if (skills.length > 0) {
        console.log();
        console.log(chalk.gray('Clone a skill collection with: sdojo clone <account>/<collection>'));
    }
});
//# sourceMappingURL=search.js.map