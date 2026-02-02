/**
 * Generate download token for collection
 * POST /api/collections/:id/download
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/lib/db/data-source';
import { DownloadTokenService } from '@/services/download-token.service';
import { SkillCollection } from '@/entities/SkillCollection';
import { verifyToken } from '@/lib/auth/jwt';
import { ZipService } from '@/services/zip.service';
import { createHash } from 'crypto';
import { ApiKey } from '@/entities/ApiKey';

// Helper to validate API key
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

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { skillPaths, branch = 'main', expiresInMinutes = 10 } = body;

    // Verify collection exists and user has access
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

    // Check if user has access (public collections or owned collections)
    if (collection.visibility !== 'public') {
      // For private collections, verify user owns it or is a member
      if (collection.accountId !== accountId) {
        // TODO: Also check organization membership
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Estimate zip size for large collections warning
    const zipService = new ZipService(ds);
    const estimatedSize = await zipService.estimateZipSize(collectionId, branch);
    const estimatedSizeMB = (estimatedSize / (1024 * 1024)).toFixed(2);

    // Create download token
    const tokenService = new DownloadTokenService(ds);
    const downloadToken = await tokenService.createToken({
      userId,
      accountId: collection.accountId,
      collectionId,
      branch,
      expiresInMinutes,
    });

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Return token and download URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3354';
    const downloadUrl = `${baseUrl}/api/collections/${collectionId}/download/${downloadToken}`;

    return NextResponse.json({
      success: true,
      downloadToken,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes,
      estimatedSizeMB,
      collection: {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
      },
      includesSkills: skillPaths || 'all',
    });
  } catch (error) {
    console.error('Error generating download token:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate download token',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
