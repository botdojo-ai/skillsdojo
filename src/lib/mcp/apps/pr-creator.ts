/**
 * Pull Request Creator MCP App
 * A form UI for creating pull requests with preview
 */

import { MCPServerContext } from "../types";

export function getPrCreatorHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Pull Request - ${ctx.collectionSlug}</title>
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
    .header h1 { font-size: 18px; font-weight: 600; }
    .badge {
      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      background: var(--accent);
    }
    .main {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 14px;
    }
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--accent);
    }
    .form-group textarea {
      min-height: 100px;
      resize: vertical;
    }
    .branch-selector {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .branch-selector select {
      flex: 1;
    }
    .arrow {
      color: var(--text-secondary);
      font-size: 16px;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
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
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--border);
    }
    .actions {
      display: flex;
      gap: 12px;
      margin-top: 24px;
    }
    .status {
      padding: 8px 20px;
      background: var(--bg-secondary);
      font-size: 12px;
      color: var(--text-secondary);
      border-top: 1px solid var(--border);
      flex-shrink: 0;
    }
    .toast {
      position: fixed;
      bottom: 60px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--success);
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
    .toast.error { border-color: var(--error); }
    .preview-section {
      margin-top: 20px;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }
    .preview-section h3 {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }
    .preview-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
    }
    .preview-item:last-child {
      border-bottom: none;
    }
    .preview-label {
      color: var(--text-secondary);
      min-width: 100px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center">
      <h1>Create Pull Request</h1>
      <span class="badge">MCP App</span>
    </div>
  </div>

  <div class="main">
    <div class="form-group">
      <label>Branches</label>
      <div class="branch-selector">
        <select id="sourceBranch">
          <option value="">Select source branch...</option>
        </select>
        <span class="arrow">\u2192</span>
        <select id="targetBranch">
          <option value="main">main</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>Title</label>
      <input type="text" id="prTitle" placeholder="Enter pull request title...">
    </div>

    <div class="form-group">
      <label>Description (optional)</label>
      <textarea id="prDescription" placeholder="Describe the changes in this pull request..."></textarea>
    </div>

    <div class="preview-section">
      <h3>Preview</h3>
      <div class="preview-item">
        <span class="preview-label">Source:</span>
        <span id="previewSource">-</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Target:</span>
        <span id="previewTarget">main</span>
      </div>
      <div class="preview-item">
        <span class="preview-label">Title:</span>
        <span id="previewTitle">-</span>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" id="createBtn" disabled>Create Pull Request</button>
      <button class="btn btn-secondary" id="cancelBtn">Cancel</button>
    </div>
  </div>

  <div class="status" id="status">Ready</div>
  <div class="toast" id="toast"></div>

  <script>
    // MCP App Protocol
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
        console.log('[MCP App] Received:', data.method);
        if (data.method === 'ui/initialize') {
          sendRpcNotification('ui/notifications/initialized', {});
          reportSize();
        } else if (data.method === 'ui/notifications/tool-input') {
          // Pre-fill from tool arguments
          if (data.params?.arguments?.source_branch) {
            document.getElementById('sourceBranch').value = data.params.arguments.source_branch;
            updatePreview();
          }
          if (data.params?.arguments?.target_branch) {
            document.getElementById('targetBranch').value = data.params.arguments.target_branch;
            updatePreview();
          }
        }
      }
    });

    function reportSize() {
      sendRpcNotification('ui/notifications/size-changed', { width: 800, height: 700 });
    }

    async function callTool(name, args) {
      return sendRpcRequest('tools/call', { name, arguments: args });
    }

    // Form elements
    const sourceBranch = document.getElementById('sourceBranch');
    const targetBranch = document.getElementById('targetBranch');
    const prTitle = document.getElementById('prTitle');
    const prDescription = document.getElementById('prDescription');
    const createBtn = document.getElementById('createBtn');
    const status = document.getElementById('status');

    function updatePreview() {
      document.getElementById('previewSource').textContent = sourceBranch.value || '-';
      document.getElementById('previewTarget').textContent = targetBranch.value || 'main';
      document.getElementById('previewTitle').textContent = prTitle.value || '-';

      // Enable/disable create button
      createBtn.disabled = !sourceBranch.value || !prTitle.value.trim();
    }

    sourceBranch.addEventListener('change', updatePreview);
    targetBranch.addEventListener('change', updatePreview);
    prTitle.addEventListener('input', updatePreview);

    async function loadBranches() {
      status.textContent = 'Loading branches...';
      try {
        const result = await callTool('list_files', { path: '', branch: 'main' });
        // For now, just add main as default
        // In a real implementation, we'd fetch actual branches
        const branches = ['main', 'develop', 'feature/new-skill'];

        sourceBranch.innerHTML = '<option value="">Select source branch...</option>';
        targetBranch.innerHTML = '';

        branches.forEach(branch => {
          sourceBranch.innerHTML += \`<option value="\${branch}">\${branch}</option>\`;
          targetBranch.innerHTML += \`<option value="\${branch}">\${branch}</option>\`;
        });

        targetBranch.value = 'main';
        status.textContent = 'Ready';
      } catch (err) {
        status.textContent = 'Error loading branches: ' + err.message;
      }
    }

    createBtn.addEventListener('click', async () => {
      if (!sourceBranch.value || !prTitle.value.trim()) return;

      createBtn.disabled = true;
      status.textContent = 'Creating pull request...';

      try {
        const result = await callTool('create_pull_request', {
          title: prTitle.value.trim(),
          description: prDescription.value.trim() || undefined,
          source_branch: sourceBranch.value,
          target_branch: targetBranch.value || 'main',
        });

        if (result?.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text);
          if (data.success) {
            showToast(\`Pull request #\${data.pullRequest.number} created!\`, 'success');
            status.textContent = 'Pull request created successfully!';

            // Reset form
            prTitle.value = '';
            prDescription.value = '';
            sourceBranch.value = '';
            updatePreview();
          }
        }
      } catch (err) {
        showToast('Failed to create PR: ' + err.message, 'error');
        status.textContent = 'Error: ' + err.message;
      }

      createBtn.disabled = false;
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      // Just reset form
      prTitle.value = '';
      prDescription.value = '';
      sourceBranch.value = '';
      updatePreview();
      status.textContent = 'Ready';
    });

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Initialize
    setTimeout(() => {
      sendRpcNotification('ui/notifications/initialized', {});
      reportSize();
      loadBranches();
    }, 50);
  </script>
</body>
</html>`;
}
