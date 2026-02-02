/**
 * Download Token Service
 * Manages secure, time-limited tokens for downloading collections/skills
 */

import { randomBytes } from 'crypto';
import { DataSource, LessThan } from 'typeorm';
import { DownloadToken } from '@/entities/DownloadToken';

export interface CreateTokenParams {
  userId: string;
  accountId: string;
  collectionId: string;
  skillId?: string | null;
  branch?: string;
  expiresInMinutes?: number;
}

export class DownloadTokenService {
  constructor(private dataSource: DataSource) {}

  /**
   * Create a new download token
   */
  async createToken(params: CreateTokenParams): Promise<string> {
    const {
      userId,
      accountId,
      collectionId,
      skillId = null,
      branch = 'main',
      expiresInMinutes = 10,
    } = params;

    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    // Generate secure random token
    const token = this.generateToken();

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    // Create token record
    const downloadToken = tokenRepo.create({
      token,
      accountId,
      collectionId,
      skillId,
      branch,
      expiresAt,
      used: false,
      usedAt: null,
      createdById: userId,
      modifiedById: userId,
    });

    await tokenRepo.save(downloadToken);

    return token;
  }

  /**
   * Validate and retrieve a token
   * Returns the token if valid, null if invalid/expired/used
   */
  async validateToken(token: string): Promise<DownloadToken | null> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const downloadToken = await tokenRepo.findOne({
      where: { token },
    });

    if (!downloadToken) {
      return null;
    }

    // Check if expired
    if (downloadToken.expiresAt < new Date()) {
      return null;
    }

    // Check if already used
    if (downloadToken.used) {
      return null;
    }

    return downloadToken;
  }

  /**
   * Mark a token as used
   */
  async consumeToken(token: string): Promise<void> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const downloadToken = await this.validateToken(token);

    if (!downloadToken) {
      throw new Error('Invalid or expired token');
    }

    downloadToken.used = true;
    downloadToken.usedAt = new Date();

    await tokenRepo.save(downloadToken);
  }

  /**
   * Clean up expired tokens (should be run periodically via cron)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const result = await tokenRepo.delete({
      expiresAt: LessThan(new Date()),
    });

    return result.affected || 0;
  }

  /**
   * Clean up used tokens older than a certain age
   */
  async cleanupUsedTokens(olderThanHours: number = 24): Promise<number> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const cutoffDate = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await tokenRepo.delete({
      used: true,
      usedAt: LessThan(cutoffDate),
    });

    return result.affected || 0;
  }

  /**
   * Get token statistics for monitoring
   */
  async getTokenStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    used: number;
  }> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const [total, expired, used] = await Promise.all([
      tokenRepo.count(),
      tokenRepo.count({
        where: {
          expiresAt: LessThan(new Date()),
        },
      }),
      tokenRepo.count({
        where: {
          used: true,
        },
      }),
    ]);

    const active = total - expired - used;

    return { total, active, expired, used };
  }

  /**
   * Generate a secure random token
   * Format: dt_<base64url>
   */
  private generateToken(): string {
    const prefix = 'dt_'; // Download Token
    const randomString = randomBytes(32).toString('base64url');
    return prefix + randomString;
  }

  /**
   * Revoke a specific token
   */
  async revokeToken(token: string): Promise<boolean> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    const result = await tokenRepo.delete({ token });

    return (result.affected || 0) > 0;
  }

  /**
   * Get token details (for admin/debugging)
   */
  async getTokenDetails(token: string): Promise<DownloadToken | null> {
    const tokenRepo = this.dataSource.getRepository(DownloadToken);

    return await tokenRepo.findOne({
      where: { token },
    });
  }
}
