/**
 * Generate download token for specific skills
 * POST /api/skills/download
 */

export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/db/data-source';
import { DownloadTokenService } from '@/services/download-token.service';
import { SkillCollection } from '@/entities/SkillCollection';
import { Skill } from '@/entities/Skill';
import { withAuth, AuthenticatedRequest } from '@/lib/auth/middleware';

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const payload = request.user;

    // Parse request body
    const body = await request.json();
    const {
      collectionId,
      skillPaths = [],
      branch = 'main',
      expiresInMinutes = 10,
    } = body;

    if (!collectionId) {
      return NextResponse.json(
        { error: 'collectionId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(skillPaths) || skillPaths.length === 0) {
      return NextResponse.json(
        { error: 'skillPaths must be a non-empty array' },
        { status: 400 }
      );
    }

    // Get data source
    const ds = await getDataSource();

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

    // Check access for private collections
    if (collection.visibility !== 'public') {
      if (collection.accountId !== payload.accountId) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }
    }

    // Verify skills exist
    const skillRepo = ds.getRepository(Skill);
    const normalizedPaths = skillPaths.map((p: string) => p.toLowerCase());

    const skills = await skillRepo
      .createQueryBuilder('skill')
      .where('skill.collectionId = :collectionId', { collectionId })
      .andWhere('skill.path IN (:...paths)', { paths: normalizedPaths })
      .andWhere('skill.archivedAt IS NULL')
      .getMany();

    if (skills.length === 0) {
      return NextResponse.json(
        { error: 'No skills found with the specified paths' },
        { status: 404 }
      );
    }

    const foundPaths = skills.map(s => s.path);
    const notFoundPaths = normalizedPaths.filter((p: string) => !foundPaths.includes(p));

    // Create download token
    const tokenService = new DownloadTokenService(ds);
    const downloadToken = await tokenService.createToken({
      userId: payload.userId,
      accountId: collection.accountId,
      collectionId,
      branch,
      expiresInMinutes,
    });

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Build download URL (will need custom handler for skill-specific downloads)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3354';
    const downloadUrl = `${baseUrl}/api/collections/${collectionId}/download/${downloadToken}?skills=${encodeURIComponent(foundPaths.join(','))}`;

    return NextResponse.json({
      success: true,
      downloadToken,
      downloadUrl,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes,
      collection: {
        id: collection.id,
        slug: collection.slug,
        name: collection.name,
      },
      skills: {
        requested: skillPaths.length,
        found: skills.length,
        foundPaths,
        notFoundPaths: notFoundPaths.length > 0 ? notFoundPaths : undefined,
      },
    });
  } catch (error) {
    console.error('Error generating skill download token:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate download token',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
});
