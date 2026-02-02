/**
 * Import skills from zip file
 * POST /api/collections/:id/import
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/lib/db/data-source';
import { ImportService } from '@/services/import.service';
import { SkillCollection } from '@/entities/SkillCollection';
import { verifyToken } from '@/lib/auth/jwt';
import { createHash } from 'crypto';
import { ApiKey } from '@/entities/ApiKey';

// Helper to validate API key (same as download route)
async function validateApiKey(fullKey: string, ds: any): Promise<{ accountId: string; userId: string } | null> {
  if (!fullKey.startsWith('sk_')) {
    return null;
  }

  const keyHash = createHash('sha256').update(fullKey).digest('hex');
  const keyPrefix = fullKey.substring(0, 12);

  const apiKeyRepo = ds.getRepository(ApiKey);

  const apiKey = await apiKeyRepo
    .createQueryBuilder('key')
    .where('key.keyPrefix = :keyPrefix', { keyPrefix })
    .andWhere('key.keyHash = :keyHash', { keyHash })
    .andWhere('key.archivedAt IS NULL')
    .getOne();

  if (!apiKey) {
    return null;
  }

  // Check expiration
  if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
    return null;
  }

  // Update last used (fire and forget)
  apiKeyRepo
    .createQueryBuilder()
    .update()
    .set({ lastUsedAt: new Date() })
    .where('id = :id', { id: apiKey.id })
    .execute()
    .catch(() => {});

  return {
    accountId: apiKey.accountId,
    userId: apiKey.createdById,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const collectionId = params.id;

    // Verify authentication (support both JWT and API keys)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const ds = await getDataSource();

    let accountId: string | undefined;
    let userId: string;

    // Try JWT first
    const jwtPayload = await verifyToken(token);
    if (jwtPayload) {
      accountId = jwtPayload.accountId;
      userId = jwtPayload.userId;
    } else {
      // Try API key
      const apiKeyResult = await validateApiKey(token, ds);
      if (!apiKeyResult) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
      accountId = apiKeyResult.accountId;
      userId = apiKeyResult.userId;
    }

    // Verify collection exists and user has write access
    const collectionRepo = ds.getRepository(SkillCollection);
    const collection = await collectionRepo.findOne({
      where: { id: collectionId },
    });

    if (!collection) {
      return NextResponse.json(
        { error: 'Collection not found' },
        { status: 404 }
      );
    }

    // Check write access
    if (collection.accountId !== accountId) {
      return NextResponse.json(
        { error: 'Write access denied. You must own the collection to import skills.' },
        { status: 403 }
      );
    }

    // Get form data (multipart/form-data for file upload)
    const formData = await request.formData();
    const zipFile = formData.get('file') as File | null;
    const overwrite = formData.get('overwrite') === 'true';
    const createPullRequest = formData.get('createPullRequest') !== 'false'; // Default true
    const prTitle = formData.get('prTitle') as string | undefined;
    const prDescription = formData.get('prDescription') as string | undefined;

    if (!zipFile) {
      return NextResponse.json(
        { error: 'No file provided. Send file as form-data with key "file"' },
        { status: 400 }
      );
    }

    // Validate file is a zip
    if (!zipFile.name.endsWith('.zip') && zipFile.type !== 'application/zip') {
      return NextResponse.json(
        { error: 'File must be a zip archive' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await zipFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate zip structure
    const importService = new ImportService(ds);
    const validation = await importService.validateZip(buffer);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Invalid zip structure',
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    // Import skills
    const importResult = await importService.importFromZip(
      collectionId,
      userId,
      buffer,
      {
        overwrite,
        createPullRequest,
        prTitle,
        prDescription,
      }
    );

    return NextResponse.json({
      success: importResult.success,
      message: createPullRequest
        ? 'Import successful. Pull request created for review.'
        : 'Import successful. Skills committed directly.',
      imported: importResult.imported,
      updated: importResult.updated,
      failed: importResult.failed,
      totalFiles: importResult.totalFiles,
      stats: {
        imported: importResult.imported.length,
        updated: importResult.updated.length,
        failed: importResult.failed.length,
      },
    });
  } catch (error) {
    console.error('Error importing zip:', error);
    return NextResponse.json(
      {
        error: 'Failed to import zip file',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
