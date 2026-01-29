"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { SkillEditor } from "@/components/skill-editor";
import { Code, ArrowLeft, Loader2 } from "lucide-react";

interface SkillFile {
  path: string;
  content: string;
}

interface Skill {
  id: string;
  name: string;
  path: string;
}

export default function SkillEditPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [files, setFiles] = useState<SkillFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const accountSlug = params.account as string;
  const collectionSlug = params.collection as string;
  const skillPath = params.skill as string;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (authLoading) return;

    const fetchData = async () => {
      try {
        // First get collection ID from slugs
        const collectionRes = await fetch(
          `/api/collections/by-slug/${accountSlug}/${collectionSlug}`,
          { credentials: "include" }
        );
        if (!collectionRes.ok) throw new Error("Collection not found");
        const collectionData = await collectionRes.json();
        setCollectionId(collectionData.id);
        setCollectionName(collectionData.name);

        // Get skill by path
        const skillRes = await fetch(
          `/api/collections/${collectionData.id}/skills/by-path/${encodeURIComponent(skillPath)}`,
          { credentials: "include" }
        );
        if (!skillRes.ok) throw new Error("Skill not found");
        const skillData = await skillRes.json();
        setSkill(skillData);

        // Fetch skill files
        const filesRes = await fetch(
          `/api/collections/${collectionData.id}/skills/${skillData.id}/files`,
          { credentials: "include" }
        );
        if (filesRes.ok) {
          const filesData = await filesRes.json();
          setFiles(filesData.files || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accountSlug, collectionSlug, skillPath, router, authLoading, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !skill || !collectionId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error || "Skill not found"}</p>
        <Link
          href={`/${accountSlug}/${collectionSlug}`}
          className="text-primary hover:underline"
        >
          Back to Collection
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <header className="border-b">
        <nav className="container mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-lg"
            >
              <Code className="h-5 w-5" />
              SkillsDojo.ai
            </Link>
            <span className="text-muted-foreground">/</span>
            <Link
              href={`/${accountSlug}/${collectionSlug}`}
              className="text-sm hover:underline"
            >
              {collectionName}
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">{skill.name}</span>
          </div>
          <Link
            href={`/${accountSlug}/${collectionSlug}/${skillPath}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Skill
          </Link>
        </nav>
      </header>

      {/* Editor */}
      <main className="flex-1 p-4">
        <div className="h-[calc(100vh-8rem)]">
          <SkillEditor
            skillId={skill.id}
            skillPath={skill.path}
            collectionId={collectionId}
            initialFiles={files}
          />
        </div>
      </main>
    </div>
  );
}
