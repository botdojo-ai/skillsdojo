/**
 * Download collection as zip using token
 * GET /api/collections/:id/download/:token
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDataSource } from '@/lib/db/data-source';
import { DownloadTokenService } from '@/services/download-token.service';
import { ZipService } from '@/services/zip.service';
import { SkillCollection } from '@/entities/SkillCollection';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; token: string }> }
) {
  try {
    const params = await context.params;
    const { id: collectionId, token } = params;

    // Get data source
    const ds = await getDataSource();

    // Validate token
    const tokenService = new DownloadTokenService(ds);
    const downloadToken = await tokenService.validateToken(token);

    if (!downloadToken) {
      return NextResponse.json(
        { error: 'Invalid, expired, or already used token' },
        { status: 403 }
      );
    }

    // Verify token matches collection
    if (downloadToken.collectionId !== collectionId) {
      return NextResponse.json(
        { error: 'Token does not match collection' },
        { status: 403 }
      );
    }

    // Get collection details
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

    // Generate zip file
    const zipService = new ZipService(ds);
    const branch = downloadToken.branch || 'main';

    let zipBuffer: Buffer;

    try {
      if (downloadToken.skillId) {
        // Download specific skill
        const skillRepo = ds.getRepository(await import('@/entities/Skill').then(m => m.Skill));
        const skill = await skillRepo.findOne({
          where: { id: downloadToken.skillId },
        });

        if (!skill) {
          return NextResponse.json(
            { error: 'Skill not found' },
            { status: 404 }
          );
        }

        zipBuffer = await zipService.generateSkillZip(
          collectionId,
          skill.path,
          { branch, includeMetadata: true }
        );
      } else {
        // Download entire collection
        zipBuffer = await zipService.generateCollectionZip(
          collectionId,
          { branch, includeMetadata: true }
        );
      }
    } catch (error) {
      console.error('Error generating zip:', error);
      return NextResponse.json(
        {
          error: 'Failed to generate zip file',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }

    // Mark token as used
    await tokenService.consumeToken(token);

    // Generate filename
    const filename = downloadToken.skillId
      ? `${collection.slug}-skill.zip`
      : `${collection.slug}.zip`;

    // Return zip file with proper headers
    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': zipBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Downloaded-At': new Date().toISOString(),
        'X-Collection-Id': collection.id,
        'X-Collection-Name': collection.name,
      },
    });
  } catch (error) {
    console.error('Error downloading collection:', error);
    return NextResponse.json(
      {
        error: 'Failed to download collection',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
