/**
 * Import Service
 * Handles importing skills from zip files
 */

import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import { DatabaseGitBackend } from '@/lib/git/db-backend';
import { SkillCollection } from '@/entities/SkillCollection';
import { Skill } from '@/entities/Skill';

export interface ImportResult {
  success: boolean;
  imported: string[];
  updated: string[];
  failed: Array<{ path: string; error: string }>;
  totalFiles: number;
}

export class ImportService {
  constructor(private dataSource: DataSource) {}

  /**
   * Import skills from a zip file buffer
   */
  async importFromZip(
    collectionId: string,
    userId: string,
    zipBuffer: Buffer,
    options: {
      overwrite?: boolean;
      createPullRequest?: boolean;
      prTitle?: string;
      prDescription?: string;
    } = {}
  ): Promise<ImportResult> {
    const { overwrite = false, createPullRequest = true } = options;

    const result: ImportResult = {
      success: false,
      imported: [],
      updated: [],
      failed: [],
      totalFiles: 0,
    };

    // Load zip file
    const zip = await JSZip.loadAsync(zipBuffer);

    // Extract all files
    const files: Array<{ path: string; content: string }> = [];
    const filePromises: Promise<void>[] = [];

    zip.forEach((relativePath, file) => {
      // Skip directories and manifest
      if (file.dir || relativePath === 'manifest.json') {
        return;
      }

      filePromises.push(
        file.async('string').then(content => {
          files.push({ path: relativePath, content });
        })
      );
    });

    await Promise.all(filePromises);
    result.totalFiles = files.length;

    if (files.length === 0) {
      throw new Error('No files found in zip archive');
    }

    // Get collection
    const collectionRepo = this.dataSource.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new Error('Collection not found');
    }

    // Process each SKILL.md file
    const skillRepo = this.dataSource.getRepository(Skill);
    const gitBackend = new DatabaseGitBackend(this.dataSource, collectionId);

    for (const file of files) {
      if (!file.path.endsWith('SKILL.md')) {
        continue; // Skip non-skill files for now
      }

      // Extract skill path (e.g., "code-review/SKILL.md" -> "code-review")
      const skillPath = file.path.replace('/SKILL.md', '').toLowerCase();

      try {
        // Check if skill exists
        const existingSkill = await skillRepo.findOne({
          where: {
            collectionId,
            path: skillPath,
            archivedAt: undefined,
          },
        });

        if (existingSkill) {
          if (!overwrite) {
            result.failed.push({
              path: skillPath,
              error: 'Skill already exists (use overwrite option)',
            });
            continue;
          }

          // Update existing skill
          existingSkill.content = file.content;
          existingSkill.modifiedById = userId;
          existingSkill.modifiedAt = new Date();

          await skillRepo.save(existingSkill);
          result.updated.push(skillPath);
        } else {
          // Create new skill
          // Parse frontmatter to get name and description
          const { name, description } = this.parseSkillFrontmatter(file.content);

          const skill = skillRepo.create({
            accountId: collection.accountId,
            collectionId,
            path: skillPath,
            name: name || skillPath,
            description: description || null,
            content: file.content,
            createdById: userId,
            modifiedById: userId,
          });

          await skillRepo.save(skill);
          result.imported.push(skillPath);

          // Update collection skill count
          await collectionRepo.increment({ id: collectionId }, 'skillCount', 1);
        }
      } catch (error) {
        result.failed.push({
          path: skillPath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Commit changes to git
    if (createPullRequest) {
      // Create a PR with the changes
      const prTitle = options.prTitle || `Import skills from zip (${result.imported.length + result.updated.length} skills)`;
      const prDescription = options.prDescription || 
        `Imported: ${result.imported.join(', ')}\nUpdated: ${result.updated.join(', ')}`;

      // Create a temporary branch
      const branchName = `import-${Date.now()}`;

      try {
        await gitBackend.commit({
          branch: branchName,
          files: files.map(f => ({ path: f.path, content: f.content })),
          message: prTitle,
          author: { name: 'Skills-Dojo Import', email: 'import@skillsdojo.ai' },
        });

        // Create PR record
        const { PullRequest } = await import('@/entities/PullRequest');
        const prRepo = this.dataSource.getRepository(PullRequest);

        const lastPr = await prRepo
          .createQueryBuilder('pr')
          .where('pr.collectionId = :collectionId', { collectionId })
          .orderBy('pr.number', 'DESC')
          .getOne();

        const nextNumber = (lastPr?.number || 0) + 1;

        const pr = prRepo.create({
          accountId: collection.accountId,
          collectionId,
          number: nextNumber,
          title: prTitle,
          description: prDescription,
          status: 'open',
          sourceBranch: branchName,
          targetBranch: 'main',
          createdById: userId,
          modifiedById: userId,
        });

        await prRepo.save(pr);
      } catch (error) {
        console.error('Failed to create PR:', error);
        // Continue anyway, changes are saved
      }
    } else {
      // Direct commit to main
      try {
        await gitBackend.commit({
          branch: 'main',
          files: files.map(f => ({ path: f.path, content: f.content })),
          message: `Import skills from zip`,
          author: { name: 'Skills-Dojo Import', email: 'import@skillsdojo.ai' },
        });
      } catch (error) {
        console.error('Failed to commit to git:', error);
      }
    }

    result.success = result.failed.length === 0 || (result.imported.length + result.updated.length) > 0;

    return result;
  }

  /**
   * Parse YAML frontmatter from SKILL.md to get name and description
   */
  private parseSkillFrontmatter(content: string): { name?: string; description?: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    
    if (!frontmatterMatch) {
      return {};
    }

    const frontmatter = frontmatterMatch[1];
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

    return {
      name: nameMatch?.[1]?.trim(),
      description: descMatch?.[1]?.trim(),
    };
  }

  /**
   * Validate zip structure before importing
   */
  async validateZip(zipBuffer: Buffer): Promise<{
    valid: boolean;
    errors: string[];
    skillCount: number;
    hasManifest: boolean;
  }> {
    const errors: string[] = [];
    let skillCount = 0;
    let hasManifest = false;

    try {
      const zip = await JSZip.loadAsync(zipBuffer);

      // Check for manifest
      const manifestFile = zip.file('manifest.json');
      if (manifestFile) {
        hasManifest = true;
        const manifestContent = await manifestFile.async('string');
        try {
          JSON.parse(manifestContent);
        } catch {
          errors.push('Invalid manifest.json format');
        }
      }

      // Count SKILL.md files
      zip.forEach((relativePath, file) => {
        if (!file.dir && relativePath.endsWith('SKILL.md')) {
          skillCount++;
        }
      });

      if (skillCount === 0) {
        errors.push('No SKILL.md files found in zip');
      }
    } catch (error) {
      errors.push('Invalid zip file format');
    }

    return {
      valid: errors.length === 0,
      errors,
      skillCount,
      hasManifest,
    };
  }
}
