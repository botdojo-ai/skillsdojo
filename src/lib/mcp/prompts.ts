/**
 * MCP Prompts Implementation for Skills-Dojo
 */

import {
  Prompt,
  GetPromptParams,
  GetPromptResult,
  MCPServerContext,
} from "./types";

// ============================================================================
// Prompt Definitions
// ============================================================================

export const PROMPTS: Prompt[] = [
  {
    name: "new_skill_template",
    description: "Generate a template for creating a new skill",
    arguments: [
      { name: "skill_name", description: "Name of the skill", required: true },
      { name: "description", description: "Brief description of what the skill does", required: true },
      { name: "category", description: "Category (e.g., 'code-review', 'documentation', 'testing')", required: false },
    ],
  },
  {
    name: "skill_improvement",
    description: "Get suggestions for improving an existing skill",
    arguments: [
      { name: "skill_path", description: "Path of the skill to improve", required: true },
    ],
  },
  {
    name: "pr_review_template",
    description: "Generate a template for reviewing a pull request",
    arguments: [
      { name: "pr_number", description: "Pull request number to review", required: true },
    ],
  },
  {
    name: "skill_documentation",
    description: "Generate documentation for a skill based on its content",
    arguments: [
      { name: "skill_path", description: "Path of the skill to document", required: true },
    ],
  },
];

// ============================================================================
// Prompt Executor
// ============================================================================

export async function getPrompt(
  params: GetPromptParams,
  ctx: MCPServerContext
): Promise<GetPromptResult> {
  const { name, arguments: args = {} } = params;

  switch (name) {
    case "new_skill_template":
      return generateNewSkillTemplate(args as { skill_name: string; description: string; category?: string }, ctx);

    case "skill_improvement":
      return generateSkillImprovementPrompt(args as { skill_path: string }, ctx);

    case "pr_review_template":
      return generatePrReviewTemplate(args as { pr_number: string }, ctx);

    case "skill_documentation":
      return generateSkillDocumentation(args as { skill_path: string }, ctx);

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ============================================================================
// Prompt Implementations
// ============================================================================

function generateNewSkillTemplate(
  args: { skill_name: string; description: string; category?: string },
  ctx: MCPServerContext
): GetPromptResult {
  const skillMdTemplate = `---
name: ${args.skill_name}
description: ${args.description}
${args.category ? `category: ${args.category}` : ""}
version: 1.0.0
author:
triggers:
  - keyword: ${args.skill_name.toLowerCase().replace(/\s+/g, "-")}
---

# ${args.skill_name}

${args.description}

## When to use this skill

<!-- Describe when this skill should be triggered or used -->

## Instructions

<!-- Main instructions for the AI agent -->

1. First, understand the context...
2. Then, analyze the requirements...
3. Finally, provide a response that...

## Examples

### Example 1: Basic usage

**User request:**
\`\`\`
<!-- Example user input -->
\`\`\`

**Expected response:**
\`\`\`
<!-- Example AI response -->
\`\`\`

## Configuration

<!-- Optional configuration options -->

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| | | | |

## Related Skills

<!-- Link to related skills in this collection -->
`;

  return {
    description: `Template for creating a new skill called "${args.skill_name}"`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `I want to create a new skill called "${args.skill_name}" with the following description: ${args.description}

Please help me write a comprehensive SKILL.md file for this skill. Use this template as a starting point:

\`\`\`markdown
${skillMdTemplate}
\`\`\`

Fill in all the placeholder sections with appropriate content based on the skill's purpose.`,
        },
      },
    ],
  };
}

function generateSkillImprovementPrompt(
  args: { skill_path: string },
  ctx: MCPServerContext
): GetPromptResult {
  return {
    description: `Review and suggest improvements for skill at "${args.skill_path}"`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please review the skill at path "${args.skill_path}" in the collection "${ctx.collectionSlug}" and suggest improvements.

First, use the read_skill tool to fetch the current skill content:

\`\`\`
read_skill(skill_path: "${args.skill_path}")
\`\`\`

Then analyze the skill and provide:

1. **Clarity Assessment**: Is the skill's purpose clear? Are instructions easy to follow?

2. **Completeness Check**: Are there missing sections or important details?

3. **Example Quality**: Are the examples helpful and realistic?

4. **Edge Cases**: What edge cases or error scenarios should be handled?

5. **Improvement Suggestions**: Specific recommendations with example text.

6. **Best Practices**: Does it follow the Agent Skills standard format?`,
        },
      },
    ],
  };
}

function generatePrReviewTemplate(
  args: { pr_number: string },
  ctx: MCPServerContext
): GetPromptResult {
  return {
    description: `Template for reviewing pull request #${args.pr_number}`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please help me review pull request #${args.pr_number} in the collection "${ctx.collectionSlug}".

First, get the PR details using:

\`\`\`
view_pull_request(pr_number: ${args.pr_number})
\`\`\`

Then provide a thorough review covering:

## Review Checklist

### Content Quality
- [ ] Clear and well-written instructions
- [ ] Appropriate examples included
- [ ] Follows skill documentation standards

### Technical Accuracy
- [ ] Instructions are technically correct
- [ ] Examples produce expected results
- [ ] No conflicting or ambiguous guidance

### Compatibility
- [ ] Compatible with existing skills
- [ ] No breaking changes to dependent skills
- [ ] Proper versioning if updating existing skill

### Best Practices
- [ ] Uses standard YAML frontmatter format
- [ ] Includes appropriate triggers
- [ ] Has proper metadata (author, version, etc.)

## Summary

Provide an overall assessment and recommendation:
- **Approve**: Ready to merge
- **Request Changes**: Specific changes needed
- **Comment**: General feedback without blocking`,
        },
      },
    ],
  };
}

function generateSkillDocumentation(
  args: { skill_path: string },
  ctx: MCPServerContext
): GetPromptResult {
  return {
    description: `Generate documentation for skill at "${args.skill_path}"`,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Please generate comprehensive documentation for the skill at "${args.skill_path}" in collection "${ctx.collectionSlug}".

First, fetch the skill content:

\`\`\`
read_skill(skill_path: "${args.skill_path}")
\`\`\`

Then generate documentation that includes:

## 1. Overview
- What the skill does
- When to use it
- Prerequisites or dependencies

## 2. Quick Start
- Minimal example to get started
- Basic usage pattern

## 3. Detailed Usage
- All available options and configurations
- Advanced usage patterns
- Integration with other skills

## 4. Examples
- Multiple practical examples
- Common use cases
- Expected outputs

## 5. Troubleshooting
- Common issues and solutions
- Known limitations

## 6. API Reference (if applicable)
- Input parameters
- Output format
- Error handling

Format the documentation in Markdown suitable for the collection's documentation site.`,
        },
      },
    ],
  };
}
