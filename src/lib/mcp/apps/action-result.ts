/**
 * Action Result MCP App
 * Shows the result of a tool action with visual feedback
 */

import { MCPServerContext } from "../types";

export function getActionResultHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Result - ${ctx.collectionSlug}</title>
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
      --success-bg: rgba(34, 197, 94, 0.1);
      --error: #ef4444;
      --error-bg: rgba(239, 68, 68, 0.1);
      --warning: #f59e0b;
      --warning-bg: rgba(245, 158, 11, 0.1);
    }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
    }
    .result-card {
      background: var(--bg-secondary);
      border-radius: 16px;
      padding: 32px 40px;
      text-align: center;
      max-width: 500px;
      width: 100%;
      border: 1px solid var(--border);
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 32px;
    }
    .icon.success {
      background: var(--success-bg);
      color: var(--success);
      border: 2px solid var(--success);
    }
    .icon.error {
      background: var(--error-bg);
      color: var(--error);
      border: 2px solid var(--error);
    }
    .icon.info {
      background: rgba(99, 102, 241, 0.1);
      color: var(--accent);
      border: 2px solid var(--accent);
    }
    .title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .message {
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .details {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 16px;
      text-align: left;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid var(--border);
    }
    .detail-row:last-child {
      border-bottom: none;
    }
    .detail-label {
      color: var(--text-secondary);
    }
    .detail-value {
      font-family: ui-monospace, 'SF Mono', Monaco, monospace;
      color: var(--text-primary);
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      margin: 0 6px;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover {
      background: var(--border);
    }
    .loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .result-card {
      animation: fadeIn 0.3s ease-out;
    }
  </style>
</head>
<body>
  <div class="result-card" id="resultCard">
    <div class="loading">
      <div class="spinner"></div>
      <div style="color: var(--text-secondary);">Processing...</div>
    </div>
  </div>

  <script>
    // MCP App Protocol
    let __rpcId = 0;
    const __pending = new Map();
    let actionData = null;

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
        } else if (data.method === 'ui/notifications/tool-result') {
          // Tool completed - show result
          if (data.params?.content?.[0]?.text) {
            try {
              const result = JSON.parse(data.params.content[0].text);
              showResult(result, data.params.isError);
            } catch (e) {
              showResult({ message: data.params.content[0].text }, data.params.isError);
            }
          }
        } else if (data.method === 'ui/notifications/tool-input') {
          // Store action data for context
          actionData = data.params?.arguments || {};
        }
      }
    });

    function reportSize() {
      sendRpcNotification('ui/notifications/size-changed', { width: 500, height: 400 });
    }

    function showResult(result, isError) {
      const card = document.getElementById('resultCard');

      // Determine action type and details
      const actionType = result.action || (result.success ? 'completed' : 'info');
      const isSuccess = result.success !== false && !isError;

      // Build details HTML
      let detailsHtml = '';
      const details = [];

      if (result.skill) {
        details.push({ label: 'Skill', value: result.skill.name || result.skill.path });
        if (result.skill.path) details.push({ label: 'Path', value: result.skill.path });
      }
      if (result.pullRequest) {
        details.push({ label: 'PR Number', value: '#' + result.pullRequest.number });
        details.push({ label: 'Title', value: result.pullRequest.title });
        if (result.pullRequest.status) details.push({ label: 'Status', value: result.pullRequest.status });
      }
      if (result.branch) {
        details.push({ label: 'Branch', value: result.branch });
      }

      if (details.length > 0) {
        detailsHtml = '<div class="details">' +
          details.map(d => \`<div class="detail-row"><span class="detail-label">\${d.label}</span><span class="detail-value">\${escapeHtml(String(d.value))}</span></div>\`).join('') +
          '</div>';
      }

      // Determine icon and title
      let icon, title, iconClass;
      if (isSuccess) {
        icon = '\u2713';
        iconClass = 'success';
        title = getSuccessTitle(result);
      } else {
        icon = '\u2717';
        iconClass = 'error';
        title = 'Action Failed';
      }

      const message = result.message || (isSuccess ? 'The action completed successfully.' : 'An error occurred.');

      // Build buttons
      let buttonsHtml = '';
      if (result.skill?.path) {
        buttonsHtml = \`<button class="btn btn-primary" onclick="viewSkill('\${result.skill.path}')">View Skill</button>\`;
      } else if (result.pullRequest?.number) {
        buttonsHtml = \`<button class="btn btn-primary" onclick="viewPR(\${result.pullRequest.number})">View PR</button>\`;
      }

      card.innerHTML = \`
        <div class="icon \${iconClass}">\${icon}</div>
        <div class="title">\${title}</div>
        <div class="message">\${escapeHtml(message)}</div>
        \${detailsHtml}
        <div>\${buttonsHtml}</div>
      \`;

      reportSize();
    }

    function getSuccessTitle(result) {
      if (result.action === 'created' || result.action === 'skill_created') return 'Skill Created';
      if (result.action === 'updated' || result.action === 'skill_updated') return 'Skill Updated';
      if (result.action === 'pr_created') return 'Pull Request Created';
      if (result.action === 'pr_merged') return 'Pull Request Merged';
      if (result.action === 'deleted') return 'Deleted Successfully';
      if (result.success) return 'Action Completed';
      return 'Done';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    async function viewSkill(path) {
      await sendRpcRequest('tools/call', { name: 'view_skill_ui', arguments: { skill_path: path } });
    }

    async function viewPR(number) {
      await sendRpcRequest('tools/call', { name: 'view_pull_request_ui', arguments: { pr_number: number } });
    }

    // Initialize
    setTimeout(() => {
      sendRpcNotification('ui/notifications/initialized', {});
      reportSize();
    }, 50);
  </script>
</body>
</html>`;
}
