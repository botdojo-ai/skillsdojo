import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NavBar } from "@/components/nav-bar";
import { Search, Code, GitBranch, Users, Zap, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen">
      <NavBar />

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          The Home for AI Agent Skills
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Discover, create, and share skills for AI agents. Version control your skills with git,
          collaborate with teams, and deploy anywhere with MCP.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link href="/register">
            <Button size="lg" className="w-full sm:w-auto">
              Start Building
            </Button>
          </Link>
          <Link href="/skills">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <Search className="mr-2 h-4 w-4" />
              Explore Skills
            </Button>
          </Link>
        </div>

        {/* Search Bar */}
        <div className="max-w-xl mx-auto">
          <form action="/skills" method="get" className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              name="q"
              placeholder="Search public skills..."
              className="pl-10 h-12"
            />
          </form>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-3 gap-8">
          <Card>
            <CardHeader>
              <GitBranch className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Git-Powered Version Control</CardTitle>
              <CardDescription>
                Every skill collection is a git repository. Branch, merge, and track changes
                with familiar workflows.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Team Collaboration</CardTitle>
              <CardDescription>
                Create organizations, manage teams, and control access. Review changes with
                pull requests before merging.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>MCP Integration</CardTitle>
              <CardDescription>
                Export skills as MCP servers. Connect to Claude, ChatGPT, and other AI agents
                with a single command.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Code className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Built-in Editor</CardTitle>
              <CardDescription>
                Edit skills directly in the browser with Monaco editor. Syntax highlighting,
                autocomplete, and live preview.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Access Control</CardTitle>
              <CardDescription>
                Fine-grained permissions for teams and API keys. Control who can read, write,
                or admin your collections.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <Search className="h-10 w-10 mb-4 text-primary" />
              <CardTitle>Skill Discovery</CardTitle>
              <CardDescription>
                Find public skills from the community. Import individual skills into your
                collections and stay in sync.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to build better AI agents?</h2>
        <p className="text-muted-foreground mb-8">
          Join developers building the future of AI agent capabilities.
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
              <Code className="h-5 w-5" />
              <span className="font-semibold">SkillsDojo.ai</span>
            </div>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/skills" className="hover:text-foreground">Skills</Link>
              <Link href="/docs" className="hover:text-foreground">Documentation</Link>
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link href="/about" className="hover:text-foreground">About</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
