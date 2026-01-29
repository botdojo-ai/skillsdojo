import { NextRequest, NextResponse } from "next/server";
import { getDataSource } from "@/lib/db/data-source";
import { Skill } from "@/entities/Skill";
import { SkillCollection } from "@/entities/SkillCollection";
import { Account } from "@/entities/Account";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(50, parseInt(searchParams.get("limit") || "20", 10));
    const offset = (page - 1) * limit;

    const ds = await getDataSource();

    // Build query for public skills
    const qb = ds
      .getRepository(Skill)
      .createQueryBuilder("skill")
      .innerJoin(SkillCollection, "collection", "collection.id = skill.collectionId")
      .innerJoin(Account, "account", "account.id = collection.accountId")
      .where("collection.visibility = :visibility", { visibility: "public" })
      .andWhere("skill.archivedAt IS NULL")
      .andWhere("collection.archivedAt IS NULL");

    // Add search filter
    if (query) {
      qb.andWhere(
        "(skill.name ILIKE :query OR skill.description ILIKE :query OR skill.path ILIKE :query)",
        { query: `%${query}%` }
      );
    }

    // Get total count
    const total = await qb.getCount();

    // Get paginated results with related data
    const skills = await qb
      .select([
        "skill.id",
        "skill.name",
        "skill.path",
        "skill.description",
        "skill.metadata",
        "skill.dependencies",
        "skill.createdAt",
        "skill.modifiedAt",
      ])
      .addSelect(["collection.id", "collection.slug", "collection.name", "collection.visibility"])
      .addSelect(["account.id", "account.slug", "account.name"])
      .orderBy("skill.modifiedAt", "DESC")
      .skip(offset)
      .take(limit)
      .getRawMany();

    // Format response
    const formattedSkills = skills.map((s) => ({
      id: s.skill_id,
      name: s.skill_name,
      path: s.skill_path,
      description: s.skill_description,
      metadata: s.skill_metadata,
      dependencies: s.skill_dependencies,
      createdAt: s.skill_createdAt,
      modifiedAt: s.skill_modifiedAt,
      collection: {
        id: s.collection_id,
        slug: s.collection_slug,
        name: s.collection_name,
      },
      account: {
        id: s.account_id,
        slug: s.account_slug,
        name: s.account_name,
      },
      // Full path for imports: accountslug/collection/skill
      fullPath: `${s.account_slug}/${s.collection_slug}/${s.skill_path}`,
    }));

    return NextResponse.json({
      skills: formattedSkills,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching public skills:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
