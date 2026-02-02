import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { Code, GitBranch, Users, Zap, Shield, FolderSync } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
      <NavBar />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Move Your Agent Skills<br />Between Applications
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Manage private AI agent skill collections that work with{" "}
          <a href="https://skills.sh" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            skills.sh
          </a>
          . Share skills across your team and sync them between Claude Code, Cursor, and other AI agents.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link href="/register">
            <Button size="lg" className="w-full sm:w-auto">
              Get Started
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <Code className="mr-2 h-4 w-4" />
              View Docs
            </Button>
          </Link>
        </div>

        {/* Quick install */}
        <div className="max-w-md mx-auto">
          <pre className="bg-muted p-4 rounded-lg text-left text-sm overflow-x-auto">
            <code className="text-muted-foreground"># Install the CLI{"\n"}</code>
            <code>npm install -g skillsd</code>
          </pre>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <FolderSync className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Sync Between Apps</CardTitle>
              <CardDescription>
                Your skills work with Claude Code, Cursor, Windsurf, and any AI agent that supports skills.sh.
                One collection, all your tools.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <GitBranch className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Git-Powered Version Control</CardTitle>
              <CardDescription>
                Every skill collection is version controlled. Track changes, create pull requests,
                and collaborate with your team.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Team Collaboration</CardTitle>
              <CardDescription>
                Share skill collections with your team. Review changes with pull requests
                before they go live.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Works with skills.sh</CardTitle>
              <CardDescription>
                Use <code className="text-xs bg-muted px-1 rounded">npx skills add</code> to add community skills.
                Push your customizations back to your private collection.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Code className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>CLI-First Workflow</CardTitle>
              <CardDescription>
                Link, status, push. A git-like workflow for managing your skills.
                Works from any project directory.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Private by Default</CardTitle>
              <CardDescription>
                Your skill collections are private. Share with your team via API keys
                or make them available to specific users.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Workflow Section */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Simple Workflow</h2>
        <div className="max-w-2xl mx-auto">
          <pre className="bg-muted p-6 rounded-lg text-sm overflow-x-auto">
            <code>{`# Link your project to a collection
skillsd link my-team/shared-skills --create

# Add skills from skills.sh
npx skills add owner/repo@skill-name -y

# Check what changed
skillsd status

# Push to your collection
skillsd push -t "Add new skill"`}</code>
          </pre>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to sync your skills?</h2>
        <p className="text-muted-foreground mb-8">
          Create a free account and start managing your AI agent skills.
        </p>
        <Link href="/register">
          <Button size="lg">Create Free Account</Button>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <FolderSync className="h-5 w-5" />
              <span className="font-semibold">SkillsDojo</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/docs" className="hover:text-foreground">Documentation</Link>
              <a href="https://skills.sh" className="hover:text-foreground" target="_blank" rel="noopener noreferrer">skills.sh</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
