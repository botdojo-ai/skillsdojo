import { Command } from 'commander';
import chalk from 'chalk';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';
import { findWorkspaceRoot, getWorkspaceConfig, getWorkspaceIndex } from '../lib/config.js';
/**
 * Get the skills directory for a workspace
 * Prefers .agents/skills/ if it exists, otherwise uses root
 */
export function getSkillsDir(workspaceRoot) {
    const agentsSkillsDir = join(workspaceRoot, '.agents', 'skills');
    if (existsSync(agentsSkillsDir)) {
        return agentsSkillsDir;
    }
    return workspaceRoot;
}
/**
 * Get list of changes in the workspace compared to the index
 */
export function getWorkspaceChanges(workspaceRoot) {
    const index = getWorkspaceIndex(workspaceRoot);
    if (!index)
        return [];
    const changes = [];
    const localFiles = new Set();
    // Check .agents/skills/ directory
    const skillsDir = getSkillsDir(workspaceRoot);
    collectFiles(skillsDir, skillsDir, localFiles);
    // Check for new and modified files
    for (const filePath of localFiles) {
        const indexEntry = index.files[filePath];
        if (!indexEntry) {
            changes.push({ path: filePath, status: 'new' });
        }
        else {
            const fullPath = join(skillsDir, filePath);
            const content = readFileSync(fullPath, 'utf-8');
            const currentSha = hashContent(content);
            if (currentSha !== indexEntry.sha) {
                changes.push({ path: filePath, status: 'modified' });
            }
        }
    }
    // Check for deleted files
    for (const filePath of Object.keys(index.files)) {
        if (!localFiles.has(filePath)) {
            changes.push({ path: filePath, status: 'deleted' });
        }
    }
    return changes;
}
export const statusCommand = new Command('status')
    .description('Show workspace status and changes')
    .action(async () => {
    const workspaceRoot = findWorkspaceRoot();
    if (!workspaceRoot) {
        console.error(chalk.red('Not in a SkillsDojo workspace'));
        console.error(chalk.gray('Run `skillsd clone <collection>` to clone a collection'));
        process.exit(1);
    }
    const config = getWorkspaceConfig(workspaceRoot);
    if (!config) {
        console.error(chalk.red('Workspace is corrupted'));
        process.exit(1);
    }
    console.log(chalk.bold(`On branch ${chalk.cyan(config.branch)}`));
    console.log(chalk.gray(`Remote: ${config.remote.account}/${config.remote.collection}`));
    console.log();
    const changes = getWorkspaceChanges(workspaceRoot);
    if (changes.length === 0) {
        console.log(chalk.green('Nothing to commit, working tree clean'));
        return;
    }
    console.log('Changes to be committed:');
    console.log();
    const newFiles = changes.filter(c => c.status === 'new').map(c => c.path).sort();
    const modifiedFiles = changes.filter(c => c.status === 'modified').map(c => c.path).sort();
    const deletedFiles = changes.filter(c => c.status === 'deleted').map(c => c.path).sort();
    for (const file of newFiles) {
        console.log(chalk.green(`  new file:   ${file}`));
    }
    for (const file of modifiedFiles) {
        console.log(chalk.yellow(`  modified:   ${file}`));
    }
    for (const file of deletedFiles) {
        console.log(chalk.red(`  deleted:    ${file}`));
    }
    console.log();
    console.log(chalk.gray(`Use "skillsd push" to submit your changes as a pull request`));
});
function collectFiles(rootDir, currentDir, files) {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        // Skip .skillsdojo directory
        if (entry.name === '.skillsdojo')
            continue;
        // Skip hidden files
        if (entry.name.startsWith('.'))
            continue;
        const fullPath = join(currentDir, entry.name);
        if (entry.isDirectory()) {
            collectFiles(rootDir, fullPath, files);
        }
        else if (entry.isFile()) {
            const relativePath = relative(rootDir, fullPath);
            files.add(relativePath);
        }
    }
}
/**
 * Calculate git blob SHA1 hash
 * Git format: sha1("blob " + content.length + "\0" + content)
 */
function hashContent(content) {
    const buffer = Buffer.from(content, 'utf-8');
    const header = `blob ${buffer.length}\0`;
    return createHash('sha1').update(header).update(buffer).digest('hex');
}
//# sourceMappingURL=status.js.map