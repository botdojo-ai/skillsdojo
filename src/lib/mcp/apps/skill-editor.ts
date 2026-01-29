/**
 * Skill Editor MCP App
 * A simple self-contained editor for creating and editing skills
 * No external dependencies - everything is bundled inline
 */

import { MCPServerContext } from "../types";

export function getSkillEditorHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill Editor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-tertiary: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --border: #475569;
      --success: #22c55e;
      --error: #ef4444;
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      display: flex;
      flex-direction: column;
      height: 100%; /* Fill container */
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header h1 { font-size: 14px; font-weight: 600; }
    .badge {
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      background: var(--accent);
    }
    .btn {
      padding: 6px 12px;
      border-radius: 5px;
      font-size: 12px;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-hover); }
    .main { flex: 1; display: flex; overflow: hidden; min-height: 0; }
    .editor-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      min-height: 0;
    }
    .editor-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 8px;
      flex-shrink: 0;
    }
    textarea {
      flex: 1;
      width: 100%;
      min-height: 450px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, 'SF Mono', Monaco, monospace;
      font-size: 13px;
      line-height: 1.5;
      resize: none;
      overflow-y: auto;
    }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    .status {
      padding: 6px 12px;
      background: var(--bg-secondary);
      font-size: 11px;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--success);
      display: none;
    }
    .toast.show { display: block; }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center">
      <h1>Skill Editor</h1>
      <span class="badge">MCP App</span>
    </div>
    <button class="btn btn-primary" id="saveBtn">Save Skill</button>
  </div>
  <div class="main">
    <div class="editor-area">
      <div class="editor-label">SKILL.md - ${ctx.collectionSlug}</div>
      <textarea id="editor" spellcheck="false">---
name: My New Skill
description: A brief description of what this skill does
version: 1.0.0
---

# My New Skill

Description of what this skill helps with.

## Instructions

1. First step
2. Second step
3. Third step

## Examples

### Example 1

User: Example input
Assistant: Example output
</textarea>
    </div>
  </div>
  <div class="status" id="status">Ready</div>
  <div class="toast" id="toast">Saved!</div>

  <script>
    // MCP App Protocol - JSON-RPC over postMessage
    (function() {
      const editor = document.getElementById('editor');
      const status = document.getElementById('status');
      const toast = document.getElementById('toast');
      let rpcId = 0;
      const pending = new Map();
      let currentSkillPath = null; // Track the loaded skill path

      function send(method, params, isRequest) {
        const msg = { jsonrpc: '2.0', method, params };
        if (isRequest) {
          msg.id = ++rpcId;
          return new Promise((resolve, reject) => {
            pending.set(msg.id, { resolve, reject });
            window.parent.postMessage(msg, '*');
          });
        }
        window.parent.postMessage(msg, '*');
      }

      window.addEventListener('message', e => {
        const d = e.data;
        if (!d || d.jsonrpc !== '2.0') return;

        if (d.id && pending.has(d.id)) {
          const p = pending.get(d.id);
          pending.delete(d.id);
          d.error ? p.reject(d.error) : p.resolve(d.result);
        } else if (d.method) {
          console.log('[MCP App] Received:', d.method);
          if (d.method === 'ui/initialize') {
            send('ui/notifications/initialized', {});
            reportSize();
          } else if (d.method === 'ui/notifications/tool-input' && d.params?.arguments?.skill_path) {
            loadSkill(d.params.arguments.skill_path);
          }
        }
      });

      function reportSize() {
        // Request a fixed size that works well for editing
        // Note: method name is size-changed (with d)
        send('ui/notifications/size-changed', { width: 1200, height: 900 });
      }

      async function loadSkill(path) {
        status.textContent = 'Loading ' + path + '...';
        try {
          const result = await send('tools/call', { name: 'read_skill', arguments: { skill_path: path } }, true);
          if (result?.content?.[0]?.text) {
            const data = JSON.parse(result.content[0].text);
            editor.value = data.content || editor.value;
            currentSkillPath = path; // Store the path for saving
            status.textContent = 'Loaded: ' + path;
            // Report new size after content loaded
            setTimeout(reportSize, 50);
          }
        } catch (err) {
          status.textContent = 'Error: ' + err.message;
        }
      }

      document.getElementById('saveBtn').addEventListener('click', async () => {
        if (!currentSkillPath) {
          status.textContent = 'No skill loaded to save';
          return;
        }

        status.textContent = 'Saving...';
        const content = editor.value;
        const nameMatch = content.match(/^name:\\s*(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim() : 'Untitled';

        try {
          await send('tools/call', {
            name: 'update_skill',
            arguments: { skill_path: currentSkillPath, name, content }
          }, true);
          status.textContent = 'Saved: ' + currentSkillPath;
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2000);
        } catch (err) {
          status.textContent = 'Error: ' + err.message;
        }
      });

      // Initialize
      setTimeout(() => {
        send('ui/notifications/initialized', {});
        reportSize();
      }, 50);
    })();
  </script>
</body>
</html>`;
}
