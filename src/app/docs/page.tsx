import Link from "next/link";
import { NavBar } from "@/components/nav-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, Download, GitBranch, Key, FolderSync, Search } from "lucide-react";

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <NavBar />

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-4">Documentation</h1>
        <p className="text-muted-foreground mb-12">
          SkillsDojo lets you manage private AI agent skill collections that work with{" "}
          <a href="https://skills.sh" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
            skills.sh
          </a>
          . Share skills across your team and sync them between applications.
        </p>

        {/* Installation */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Download className="h-6 w-6" />
            Installation
          </h2>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-4">Install the SkillsDojo CLI globally:</p>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                <code>npm install -g skillsd</code>
              </pre>
              <p className="mt-4 text-sm text-muted-foreground">
                Requires Node.js 18 or later. Works alongside the skills.sh CLI.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Authentication */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Key className="h-6 w-6" />
            Authentication
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-medium mb-2">Login with API token</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>skillsd auth login --token YOUR_API_KEY</code>
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Get your API key from{" "}
                  <Link href="/dashboard" className="text-primary hover:underline">
                    Settings → API Keys
                  </Link>
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Check login status</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>skillsd auth whoami</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Quick Start */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Terminal className="h-6 w-6" />
            Quick Start
          </h2>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-4">Link your project to a SkillsDojo collection and start adding skills:</p>
              <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
                <code>{`# Link current directory to a collection
skillsd link my-account/my-collection --create

# Search for skills on skills.sh
npx skills find "commit"

# Add a skill from skills.sh
npx skills add marcelorodrigo/agent-skills@conventional-commit -y

# Check what changed
skillsd status

# Push to SkillsDojo (creates a PR)
skillsd push -t "Add conventional-commit skill"`}</code>
              </pre>
            </CardContent>
          </Card>
        </section>

        {/* Workflow */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <FolderSync className="h-6 w-6" />
            Workflow
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <h3 className="font-medium mb-2">1. Link your project</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>skillsd link account/collection</code>
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Creates <code className="bg-background px-1 rounded">.skillsdojo/</code> config and{" "}
                  <code className="bg-background px-1 rounded">.agents/skills/</code> directory.
                  Use <code className="bg-background px-1 rounded">--create</code> to create a new collection.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">2. Add skills from skills.sh</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>{`# Search for skills
npx skills find "your query"

# Add a skill
npx skills add owner/repo@skill-name -y`}</code>
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Skills are installed to <code className="bg-background px-1 rounded">.agents/skills/</code> and
                  automatically configured for Claude Code, Cursor, and other AI agents.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">3. Check status</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>skillsd status</code>
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Shows new, modified, and deleted skills compared to the remote collection.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">4. Push changes</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>skillsd push -t &quot;Add new skills&quot;</code>
                </pre>
                <p className="mt-2 text-sm text-muted-foreground">
                  Creates a pull request with your changes. Merge via the web UI.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Clone existing collection */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <GitBranch className="h-6 w-6" />
            Clone Existing Collection
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <p className="mb-4">Download an existing collection with all its skills:</p>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>{`# Clone a collection
skillsd clone account/collection

# Work in the cloned directory
cd collection
skillsd status`}</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Search skills.sh */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Search className="h-6 w-6" />
            Finding Skills
          </h2>
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="font-medium mb-2">Search skills.sh</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>{`# Interactive search
npx skills find

# Search with query
npx skills find "code review"`}</code>
                </pre>
              </div>
              <div>
                <h3 className="font-medium mb-2">List skills from a repository</h3>
                <pre className="bg-muted p-4 rounded-lg overflow-x-auto">
                  <code>npx skills add owner/repo -l</code>
                </pre>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Command Reference */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Command Reference</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4">Command</th>
                      <th className="text-left py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd auth login</code></td>
                      <td className="py-2 font-sans">Login to SkillsDojo</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd auth whoami</code></td>
                      <td className="py-2 font-sans">Show current user</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd link &lt;collection&gt;</code></td>
                      <td className="py-2 font-sans">Link directory to collection</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd clone &lt;collection&gt;</code></td>
                      <td className="py-2 font-sans">Clone a collection locally</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd status</code></td>
                      <td className="py-2 font-sans">Show local changes</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd push</code></td>
                      <td className="py-2 font-sans">Push changes as PR</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd collection list</code></td>
                      <td className="py-2 font-sans">List your collections</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd collection create</code></td>
                      <td className="py-2 font-sans">Create new collection</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd skill list</code></td>
                      <td className="py-2 font-sans">List skills in collection</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4"><code>skillsd download</code></td>
                      <td className="py-2 font-sans">Download collection as ZIP</td>
                    </tr>
                    <tr className="border-b bg-muted/50">
                      <td className="py-2 pr-4"><code>npx skills find</code></td>
                      <td className="py-2 font-sans">Search skills.sh</td>
                    </tr>
                    <tr className="bg-muted/50">
                      <td className="py-2 pr-4"><code>npx skills add</code></td>
                      <td className="py-2 font-sans">Add skill from skills.sh</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Help */}
        <section className="mb-12">
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Need help?</CardTitle>
              <CardDescription>
                Run <code className="bg-background px-1 py-0.5 rounded">skillsd --help</code> for all commands.
                Visit <a href="https://skills.sh" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">skills.sh</a> to
                browse community skills.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        {/* Footer */}
        <footer className="border-t pt-8 mt-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <div>
              <Link href="/" className="hover:text-foreground">
                SkillsDojo
              </Link>
            </div>
            <div className="flex gap-6">
              <Link href="/register" className="hover:text-foreground">Create Account</Link>
              <Link href="/login" className="hover:text-foreground">Login</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
