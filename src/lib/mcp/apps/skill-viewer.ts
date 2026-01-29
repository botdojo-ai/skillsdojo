/**
 * Skill Viewer MCP App
 * A visual viewer for displaying skill content in formatted way
 */

import { MCPServerContext } from "../types";

export function getSkillViewerHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill Viewer - ${ctx.collectionSlug}</title>
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
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 600;
    }
    .skill-path {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: monospace;
      background: var(--bg-tertiary);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      background: var(--accent);
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .main {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .meta-section {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .meta-card {
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .meta-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .meta-value {
      font-size: 14px;
    }
    .content-section {
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .content-header {
      padding: 12px 16px;
      background: var(--bg-tertiary);
      font-size: 13px;
      font-weight: 500;
      border-bottom: 1px solid var(--border);
    }
    .content-body {
      padding: 20px;
      line-height: 1.7;
      font-size: 14px;
    }
    .content-body h1, .content-body h2, .content-body h3 {
      margin-top: 24px;
      margin-bottom: 12px;
      color: var(--text-primary);
    }
    .content-body h1 { font-size: 24px; }
    .content-body h2 { font-size: 20px; }
    .content-body h3 { font-size: 16px; }
    .content-body p {
      margin-bottom: 12px;
    }
    .content-body ul, .content-body ol {
      margin-left: 24px;
      margin-bottom: 12px;
    }
    .content-body li {
      margin-bottom: 6px;
    }
    .content-body code {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: ui-monospace, 'SF Mono', Monaco, monospace;
      font-size: 13px;
    }
    .content-body pre {
      background: var(--bg-tertiary);
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 16px;
    }
    .content-body pre code {
      background: none;
      padding: 0;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: var(--text-secondary);
    }
    .spinner {
      width: 24px;
      height: 24px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 12px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .status {
      padding: 8px 20px;
      background: var(--bg-secondary);
      font-size: 12px;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1 id="skillName">Loading...</h1>
      <span class="skill-path" id="skillPath">-</span>
    </div>
    <button class="btn btn-primary" id="editBtn">Edit Skill</button>
  </div>

  <div class="main" id="main">
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading skill...</span>
    </div>
  </div>

  <div class="status" id="status">Ready</div>

  <script>
    // MCP App Protocol
    let __rpcId = 0;
    const __pending = new Map();
    let currentSkillPath = null;

    function sendRpcRequest(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++__rpcId;
        const message = { jsonrpc: '2.0', id, method, params };
        const timeout = setTimeout(() => {
          __pending.delete(id);
          reject(new Error(\`\${method} timed out\`));
        }, 30000);
        __pending.set(id, { resolve, reject, timeout });
        window.parent.postMessage(message, '*');
      });
    }

    function sendRpcNotification(method, params) {
      window.parent.postMessage({ jsonrpc: '2.0', method, params }, '*');
    }

    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.jsonrpc !== '2.0') return;

      if (data.id !== undefined) {
        const entry = __pending.get(data.id);
        if (entry) {
          __pending.delete(data.id);
          clearTimeout(entry.timeout);
          if ('result' in data) {
            entry.resolve(data.result);
          } else {
            entry.reject(data.error || new Error('Unknown error'));
          }
        }
      } else if (data.method) {
        console.log('[MCP App] Received:', data.method);
        if (data.method === 'ui/initialize') {
          sendRpcNotification('ui/notifications/initialized', {});
          reportSize();
        } else if (data.method === 'ui/notifications/tool-input') {
          if (data.params?.arguments?.skill_path) {
            loadSkill(data.params.arguments.skill_path);
          }
        }
      }
    });

    function reportSize() {
      sendRpcNotification('ui/notifications/size-changed', { width: 900, height: 700 });
    }

    async function callTool(name, args) {
      return sendRpcRequest('tools/call', { name, arguments: args });
    }

    async function loadSkill(path) {
      currentSkillPath = path;
      document.getElementById('skillPath').textContent = path;
      document.getElementById('status').textContent = 'Loading ' + path + '...';

      try {
        const result = await callTool('read_skill', { skill_path: path });
        if (result?.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text);
          renderSkill(data);
          document.getElementById('status').textContent = 'Loaded: ' + path;
        }
      } catch (err) {
        document.getElementById('main').innerHTML = \`
          <div class="loading" style="color: var(--error);">
            Error loading skill: \${err.message}
          </div>
        \`;
        document.getElementById('status').textContent = 'Error: ' + err.message;
      }
    }

    function renderSkill(skill) {
      document.getElementById('skillName').textContent = skill.name;

      // Simple markdown to HTML conversion
      let htmlContent = escapeHtml(skill.content || '')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/^---$/gm, '<hr>')
        .replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>')
        .replace(/\\*(.+?)\\*/g, '<em>$1</em>')
        .replace(/\\\`(.+?)\\\`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>')
        .replace(/\\n\\n/g, '</p><p>')
        .replace(/\\n/g, '<br>');

      document.getElementById('main').innerHTML = \`
        <div class="meta-section">
          <div class="meta-card">
            <div class="meta-label">Name</div>
            <div class="meta-value">\${escapeHtml(skill.name)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Path</div>
            <div class="meta-value" style="font-family: monospace;">\${escapeHtml(skill.path)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Description</div>
            <div class="meta-value">\${escapeHtml(skill.description || 'No description')}</div>
          </div>
        </div>
        <div class="content-section">
          <div class="content-header">SKILL.md</div>
          <div class="content-body">
            <p>\${htmlContent}</p>
          </div>
        </div>
      \`;

      reportSize();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    document.getElementById('editBtn').addEventListener('click', () => {
      if (currentSkillPath) {
        callTool('edit_skill_ui', { skill_path: currentSkillPath });
      }
    });

    // Initialize
    setTimeout(() => {
      sendRpcNotification('ui/notifications/initialized', {});
      reportSize();
    }, 50);
  </script>
</body>
</html>`;
}
