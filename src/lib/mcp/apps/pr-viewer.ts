/**
 * Pull Request Viewer MCP App
 * A visual diff viewer for reviewing pull requests
 */

import { MCPServerContext } from "../types";

export function getPrViewerHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pull Request Viewer - ${ctx.collectionSlug}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

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
      --warning: #f59e0b;
      --diff-add-bg: rgba(34, 197, 94, 0.1);
      --diff-add-border: rgba(34, 197, 94, 0.3);
      --diff-remove-bg: rgba(239, 68, 68, 0.1);
      --diff-remove-border: rgba(239, 68, 68, 0.3);
    }

    html, body {
      height: 100%;
      width: 100%;
      overflow: hidden;
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100%; /* Fill container */
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 16px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .pr-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .pr-title h1 {
      font-size: 20px;
      font-weight: 600;
    }

    .pr-number {
      color: var(--text-secondary);
      font-weight: normal;
    }

    .status-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      text-transform: capitalize;
    }

    .status-badge.open { background: var(--success); color: white; }
    .status-badge.merged { background: var(--accent); color: white; }
    .status-badge.closed { background: var(--error); color: white; }

    .pr-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .pr-meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .branch-badge {
      padding: 2px 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
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
      background: var(--success);
      color: white;
    }

    .btn-primary:hover {
      opacity: 0.9;
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--border);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .tabs {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 0 20px;
      flex-shrink: 0;
    }

    .tab {
      padding: 12px 16px;
      font-size: 14px;
      color: var(--text-secondary);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      margin-bottom: -1px;
    }

    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent);
    }

    .tab:hover:not(.active) {
      color: var(--text-primary);
    }

    .tab-count {
      margin-left: 6px;
      padding: 2px 6px;
      background: var(--bg-tertiary);
      border-radius: 10px;
      font-size: 11px;
    }

    .content {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .description {
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 20px;
      line-height: 1.6;
    }

    .description:empty::before {
      content: 'No description provided.';
      color: var(--text-secondary);
      font-style: italic;
    }

    .file-list {
      margin-bottom: 20px;
    }

    .file-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px 8px 0 0;
      cursor: pointer;
    }

    .file-header:hover {
      background: var(--bg-tertiary);
    }

    .file-info {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .file-name {
      font-family: monospace;
      font-size: 13px;
    }

    .file-stats {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }

    .stat-add { color: var(--success); }
    .stat-remove { color: var(--error); }

    .diff-container {
      border: 1px solid var(--border);
      border-top: none;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }

    .diff-line {
      display: flex;
      font-family: monospace;
      font-size: 13px;
      line-height: 1.5;
    }

    .diff-line-number {
      width: 50px;
      padding: 0 8px;
      text-align: right;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      user-select: none;
      flex-shrink: 0;
    }

    .diff-line-content {
      flex: 1;
      padding: 0 12px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .diff-line.add {
      background: var(--diff-add-bg);
    }

    .diff-line.add .diff-line-number {
      background: var(--diff-add-border);
    }

    .diff-line.remove {
      background: var(--diff-remove-bg);
    }

    .diff-line.remove .diff-line-number {
      background: var(--diff-remove-border);
    }

    .diff-line.hunk {
      background: var(--bg-tertiary);
      color: var(--accent);
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }

    .empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
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

    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-size: 14px;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s;
    }

    .toast.show {
      transform: translateY(0);
      opacity: 1;
    }

    .toast.success { border-color: var(--success); }
    .toast.error { border-color: var(--error); }
  </style>
</head>
<body>
  <div class="header">
    <div class="pr-title">
      <h1 id="prTitle">Loading...</h1>
      <span class="status-badge open" id="prStatus">open</span>
    </div>
    <div class="pr-meta">
      <div class="pr-meta-item">
        <span class="branch-badge" id="sourceBranch">feature</span>
        <span>→</span>
        <span class="branch-badge" id="targetBranch">main</span>
      </div>
      <div class="pr-meta-item" id="prDate"></div>
    </div>
    <div class="actions" id="actions">
      <button class="btn btn-primary" id="btnMerge">Merge Pull Request</button>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" data-tab="changes">
      Files Changed <span class="tab-count" id="fileCount">0</span>
    </div>
    <div class="tab" data-tab="commits">
      Commits <span class="tab-count" id="commitCount">0</span>
    </div>
  </div>

  <div class="content" id="content">
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading pull request...</span>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <!-- MCP App Protocol -->
  <script>
    let __rpcId = 0;
    const __pending = new Map();

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
        handleHostMessage(data.method, data.params);
      }
    });

    function handleHostMessage(method, params) {
      console.log('[MCP App] Received:', method);
      if (method === 'ui/initialize') {
        // Host initialized us, respond with initialized notification
        sendRpcNotification('ui/notifications/initialized', {});
        reportSize();
      } else if (method === 'ui/notifications/tool-input') {
        if (params?.arguments?.pr_number) {
          loadPullRequest(params.arguments.pr_number);
        }
      } else if (method === 'ui/notifications/tool-result') {
        // Tool result received, update UI if needed
        if (params?.content?.[0]?.text) {
          try {
            const data = JSON.parse(params.content[0].text);
            renderPullRequest(data);
          } catch (e) {
            console.error('Failed to parse tool result:', e);
          }
        }
      }
    }

    function reportSize() {
      // Request large size for better viewing
      // Note: method name is size-changed (with d)
      sendRpcNotification('ui/notifications/size-changed', { width: 1200, height: 900 });
    }

    async function callTool(name, args) {
      return sendRpcRequest('tools/call', { name, arguments: args });
    }

    async function sendChatMessage(text) {
      return sendRpcRequest('ui/message', {
        role: 'user',
        content: { type: 'text', text }
      });
    }
  </script>

  <!-- PR Viewer logic -->
  <script>
    let currentPR = null;

    async function loadPullRequest(prNumber) {
      try {
        const result = await callTool('get_pull_request', { pr_number: prNumber });
        if (result?.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text);
          renderPullRequest(data);
        }
      } catch (error) {
        showToast('Failed to load PR: ' + error.message, 'error');
      }
    }

    function renderPullRequest(pr) {
      currentPR = pr;

      document.getElementById('prTitle').innerHTML = \`\${pr.title} <span class="pr-number">#\${pr.number}</span>\`;

      const statusBadge = document.getElementById('prStatus');
      statusBadge.textContent = pr.status;
      statusBadge.className = 'status-badge ' + pr.status;

      document.getElementById('sourceBranch').textContent = pr.sourceBranch;
      document.getElementById('targetBranch').textContent = pr.targetBranch;

      const date = new Date(pr.createdAt);
      document.getElementById('prDate').textContent = 'Created ' + date.toLocaleDateString();

      // Update actions based on status
      const mergeBtn = document.getElementById('btnMerge');
      mergeBtn.disabled = pr.status !== 'open';

      // Render description and diff
      document.getElementById('content').innerHTML = \`
        <div class="description">\${pr.description || ''}</div>
        <div class="file-list" id="fileList">
          \${renderMockDiff()}
        </div>
      \`;

      document.getElementById('fileCount').textContent = '1';
    }

    function renderMockDiff() {
      // Mock diff for demonstration
      return \`
        <div class="file-header">
          <div class="file-info">
            <span class="file-name">SKILL.md</span>
          </div>
          <div class="file-stats">
            <span class="stat-add">+5</span>
            <span class="stat-remove">-2</span>
          </div>
        </div>
        <div class="diff-container">
          <div class="diff-line hunk">
            <span class="diff-line-number">...</span>
            <span class="diff-line-content">@@ -1,10 +1,13 @@</span>
          </div>
          <div class="diff-line">
            <span class="diff-line-number">1</span>
            <span class="diff-line-content">---</span>
          </div>
          <div class="diff-line remove">
            <span class="diff-line-number">2</span>
            <span class="diff-line-content">name: Old Skill Name</span>
          </div>
          <div class="diff-line add">
            <span class="diff-line-number">2</span>
            <span class="diff-line-content">name: Updated Skill Name</span>
          </div>
          <div class="diff-line">
            <span class="diff-line-number">3</span>
            <span class="diff-line-content">description: A skill description</span>
          </div>
          <div class="diff-line add">
            <span class="diff-line-number">4</span>
            <span class="diff-line-content">version: 1.1.0</span>
          </div>
          <div class="diff-line">
            <span class="diff-line-number">5</span>
            <span class="diff-line-content">---</span>
          </div>
        </div>
      \`;
    }

    async function mergePR() {
      if (!currentPR) return;

      try {
        const result = await callTool('merge_pull_request', { pr_number: currentPR.number });
        if (result?.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text);
          if (data.success) {
            showToast('Pull request merged successfully!', 'success');
            sendChatMessage(\`Pull request #\${currentPR.number} has been merged.\`);
            loadPullRequest(currentPR.number);
          }
        }
      } catch (error) {
        showToast('Failed to merge PR: ' + error.message, 'error');
      }
    }

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Event handlers
    document.getElementById('btnMerge').addEventListener('click', mergePR);

    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
      });
    });

    // Initialize - notify host we're ready
    setTimeout(() => {
      sendRpcNotification('ui/notifications/initialized', {});
      reportSize();
    }, 50);

    // Show empty state if no PR loaded
    setTimeout(() => {
      if (!currentPR) {
        document.getElementById('content').innerHTML = \`
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M8 12h8M12 8v8"></path>
            </svg>
            <p>No pull request loaded</p>
            <p style="font-size: 13px; margin-top: 8px;">Use the view_pull_request tool to load a PR</p>
          </div>
        \`;
      }
    }, 2000);
  </script>
</body>
</html>`;
}
