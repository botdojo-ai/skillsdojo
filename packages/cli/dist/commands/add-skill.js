import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { api } from '../lib/api.js';
import { requireAuth } from '../lib/auth.js';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
/**
 * Get the skills installation directory
 */
function getSkillsDir(global) {
    if (global) {
        // Global: ~/.agents/skills/
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        return join(homeDir, '.agents', 'skills');
    }
    // Local: .agents/skills/ in current directory
    return join(process.cwd(), '.agents', 'skills');
}
/**
 * Download and extract a skill from SkillsDojo
 */
export async function addSkillFromDojo(accountSlug, collectionSlug, skillPath, options) {
    const creds = requireAuth();
    // List mode - just show the skill info
    if (options.list) {
        const spinner = ora('Fetching skill info...').start();
        const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);
        if (collResponse.error || !collResponse.data) {
            spinner.fail('Collection not found');
            console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
            console.error(chalk.gray('Make sure you have access to this collection'));
            process.exit(1);
        }
        const skillsResponse = await api.listSkills(collResponse.data.id, { search: skillPath, limit: 100 });
        if (skillsResponse.error || !skillsResponse.data) {
            spinner.fail('Failed to list skills');
            console.error(chalk.red(skillsResponse.error?.message || 'Failed to list skills'));
            process.exit(1);
        }
        const skill = skillsResponse.data.items.find(s => s.path === skillPath);
        if (!skill) {
            spinner.fail(`Skill "${skillPath}" not found in collection`);
            const available = skillsResponse.data.items.map(s => s.path).slice(0, 10);
            if (available.length > 0) {
                console.log(chalk.gray('\nAvailable skills:'));
                available.forEach(s => console.log(chalk.gray(`  - ${accountSlug}/${collectionSlug}/${s}`)));
            }
            process.exit(1);
        }
        spinner.stop();
        console.log(`\n${chalk.bold(skill.name)}`);
        console.log(chalk.gray(`${accountSlug}/${collectionSlug}/${skillPath}`));
        if (skill.description) {
            console.log(`\n${skill.description}`);
        }
        console.log(chalk.gray(`\nTo install: skillsd add ${accountSlug}/${collectionSlug}/${skillPath}`));
        return;
    }
    const spinner = ora(`Adding skill from ${accountSlug}/${collectionSlug}...`).start();
    // Get collection by slug
    const collResponse = await api.getCollectionBySlug(accountSlug, collectionSlug);
    if (collResponse.error || !collResponse.data) {
        spinner.fail('Collection not found');
        console.error(chalk.red(collResponse.error?.message || 'Collection not found'));
        console.error(chalk.gray('Make sure you have access to this collection'));
        process.exit(1);
    }
    const collection = collResponse.data;
    // Request download token for specific skill
    spinner.text = 'Requesting download...';
    const tokenResponse = await api.requestSkillsDownloadToken(collection.id, {
        skillPaths: [skillPath],
    });
    if (tokenResponse.error || !tokenResponse.data) {
        spinner.fail('Failed to request download');
        console.error(chalk.red(tokenResponse.error?.message || 'Failed to request download token'));
        process.exit(1);
    }
    const { downloadToken, skills } = tokenResponse.data;
    if (skills.found === 0) {
        spinner.fail(`Skill "${skillPath}" not found in collection`);
        if (skills.notFoundPaths && skills.notFoundPaths.length > 0) {
            console.error(chalk.gray(`Not found: ${skills.notFoundPaths.join(', ')}`));
        }
        process.exit(1);
    }
    // Download to temp file
    spinner.text = 'Downloading skill...';
    const tempFile = join(tmpdir(), `skillsd-${randomBytes(8).toString('hex')}.zip`);
    try {
        await api.downloadZip(collection.id, downloadToken, tempFile);
    }
    catch (error) {
        spinner.fail('Download failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Download failed'));
        process.exit(1);
    }
    // Determine installation directory
    const skillsDir = getSkillsDir(options.global || false);
    const targetDir = join(skillsDir, skillPath);
    // Check if skill already exists
    if (existsSync(targetDir) && !options.yes) {
        spinner.stop();
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: `Skill "${skillPath}" already exists. Overwrite?`,
                default: false,
            },
        ]);
        if (!overwrite) {
            console.log(chalk.yellow('Installation cancelled'));
            unlinkSync(tempFile);
            process.exit(0);
        }
        spinner.start('Installing skill...');
    }
    // Extract to skills directory
    spinner.text = 'Installing skill...';
    // Create skills directory if it doesn't exist
    if (!existsSync(skillsDir)) {
        mkdirSync(skillsDir, { recursive: true });
    }
    // Extract using unzip command
    try {
        // Extract to a temp directory first
        const extractDir = join(tmpdir(), `skillsd-extract-${randomBytes(8).toString('hex')}`);
        mkdirSync(extractDir, { recursive: true });
        execSync(`unzip -o "${tempFile}" -d "${extractDir}"`, { stdio: 'pipe' });
        // Find the skill directory in extracted files
        const extractedSkillDir = join(extractDir, skillPath);
        if (existsSync(extractedSkillDir)) {
            // Remove existing target if it exists
            if (existsSync(targetDir)) {
                execSync(`rm -rf "${targetDir}"`, { stdio: 'pipe' });
            }
            // Create parent directory and copy contents (not the directory itself)
            mkdirSync(targetDir, { recursive: true });
            execSync(`cp -r "${extractedSkillDir}/"* "${targetDir}/"`, { stdio: 'pipe', shell: '/bin/bash' });
        }
        else {
            throw new Error(`Skill directory not found in archive`);
        }
        // Cleanup
        execSync(`rm -rf "${extractDir}"`, { stdio: 'pipe' });
    }
    catch (error) {
        spinner.fail('Extraction failed');
        console.error(chalk.red(error instanceof Error ? error.message : 'Extraction failed'));
        unlinkSync(tempFile);
        process.exit(1);
    }
    // Cleanup temp file
    unlinkSync(tempFile);
    spinner.succeed(`Added ${chalk.green(skillPath)} from ${accountSlug}/${collectionSlug}`);
    console.log(chalk.gray(`  Installed to: ${targetDir}`));
}
//# sourceMappingURL=add-skill.js.map