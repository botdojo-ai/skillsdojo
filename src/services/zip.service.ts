/**
 * Zip Service
 * Generates zip archives from skill collections stored in git
 */

import JSZip from 'jszip';
import { DataSource } from 'typeorm';
import { DatabaseGitBackend } from '@/lib/git/db-backend';
import { SkillCollection } from '@/entities/SkillCollection';
import { Skill } from '@/entities/Skill';

export interface ZipOptions {
  branch?: string;
  includeMetadata?: boolean;
}

export class ZipService {
  constructor(private dataSource: DataSource) {}

  /**
   * Generate a zip archive for an entire collection
   */
  async generateCollectionZip(
    collectionId: string,
    options: ZipOptions = {}
  ): Promise<Buffer> {
    const { branch = 'main', includeMetadata = true } = options;

    const gitBackend = new DatabaseGitBackend(this.dataSource, collectionId);
    const zip = new JSZip();

    // Get collection metadata
    const collectionRepo = this.dataSource.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Get all files from the git tree
    const files = await gitBackend.listFiles(branch, '');

    // Add each file to the zip
    for (const file of files) {
      try {
        const content = await gitBackend.getFile(branch, file.path);
        if (content) {
          zip.file(file.path, content);
        }
      } catch (error) {
        console.error(`Failed to add file ${file.path}:`, error);
        // Continue with other files
      }
    }

    // Add metadata manifest if requested
    if (includeMetadata) {
      const manifest = await this.generateManifest(collectionId);
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    }

    // Generate the zip file
    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }, // Medium compression
    });
  }

  /**
   * Generate a zip archive for specific skills
   */
  async generateSkillsZip(
    collectionId: string,
    skillPaths: string[],
    options: ZipOptions = {}
  ): Promise<Buffer> {
    const { branch = 'main', includeMetadata = true } = options;

    const gitBackend = new DatabaseGitBackend(this.dataSource, collectionId);
    const zip = new JSZip();

    // Normalize paths (lowercase, remove trailing slashes)
    const normalizedPaths = skillPaths.map(p => p.toLowerCase().replace(/\/$/, ''));

    // Get all files
    const allFiles = await gitBackend.listFiles(branch, '');

    // Filter files that belong to the specified skills
    const filteredFiles = allFiles.filter(file => {
      return normalizedPaths.some(skillPath => {
        return file.path.startsWith(`${skillPath}/`) || file.path === skillPath;
      });
    });

    if (filteredFiles.length === 0) {
      throw new Error('No files found for the specified skills');
    }

    // Add filtered files to zip
    for (const file of filteredFiles) {
      try {
        const content = await gitBackend.getFile(branch, file.path);
        if (content) {
          zip.file(file.path, content);
        }
      } catch (error) {
        console.error(`Failed to add file ${file.path}:`, error);
      }
    }

    // Add metadata for included skills
    if (includeMetadata) {
      const manifest = await this.generateManifest(collectionId, normalizedPaths);
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    }

    return await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  /**
   * Generate a zip archive for a single skill
   */
  async generateSkillZip(
    collectionId: string,
    skillPath: string,
    options: ZipOptions = {}
  ): Promise<Buffer> {
    return this.generateSkillsZip(collectionId, [skillPath], options);
  }

  /**
   * Generate manifest metadata for the zip
   */
  private async generateManifest(
    collectionId: string,
    skillPaths?: string[]
  ): Promise<object> {
    const collectionRepo = this.dataSource.getRepository(SkillCollection);
    const skillRepo = this.dataSource.getRepository(Skill);

    const collection = await collectionRepo.findOne({
      where: { id: collectionId },
    });

    if (!collection) {
      throw new Error('Collection not found');
    }

    // Get skills data
    const skillsQuery = skillRepo
      .createQueryBuilder('skill')
      .where('skill.collectionId = :collectionId', { collectionId })
      .andWhere('skill.archivedAt IS NULL');

    if (skillPaths && skillPaths.length > 0) {
      skillsQuery.andWhere('skill.path IN (:...paths)', { paths: skillPaths });
    }

    const skills = await skillsQuery.getMany();

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      collection: {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
      },
      skills: skills.map(skill => ({
        path: skill.path,
        name: skill.name,
        description: skill.description,
        metadata: skill.metadata,
        dependencies: skill.dependencies,
      })),
      stats: {
        totalSkills: skills.length,
        totalFiles: skills.length, // Approximate, could calculate actual files
      },
    };
  }

  /**
   * Get estimated zip size without generating it
   */
  async estimateZipSize(
    collectionId: string,
    branch: string = 'main'
  ): Promise<number> {
    const gitBackend = new DatabaseGitBackend(this.dataSource, collectionId);
    const files = await gitBackend.listFiles(branch, '');

    let totalSize = 0;
    for (const file of files) {
      try {
        const content = await gitBackend.getFile(branch, file.path);
        if (content) {
          totalSize += content.length;
        }
      } catch {
        // Skip files we can't read
      }
    }

    // Estimate compressed size (roughly 30-40% of original for text files)
    return Math.floor(totalSize * 0.35);
  }
}
