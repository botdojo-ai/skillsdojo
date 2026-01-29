/**
 * Collection Browser MCP App
 * A visual browser for exploring skill collections
 */

import { MCPServerContext } from "../types";

export function getCollectionBrowserHtml(ctx: MCPServerContext): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Collection Browser - ${ctx.collectionSlug}</title>
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
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .header {
      padding: 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .collection-info {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }

    .collection-icon {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, var(--accent), #8b5cf6);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .collection-details h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .collection-slug {
      font-size: 13px;
      color: var(--text-secondary);
      font-family: monospace;
    }

    .collection-description {
      margin-top: 8px;
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .collection-stats {
      display: flex;
      gap: 20px;
      margin-top: 16px;
    }

    .stat {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 20px;
      font-weight: 600;
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
    }

    .search-container {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }

    .search-input {
      width: 100%;
      padding: 10px 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .search-input::placeholder {
      color: var(--text-secondary);
    }

    .content {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .skills-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .skill-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .skill-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .skill-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .skill-name {
      font-size: 15px;
      font-weight: 600;
    }

    .skill-path {
      font-size: 12px;
      color: var(--text-secondary);
      font-family: monospace;
      margin-top: 2px;
    }

    .skill-description {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-top: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .skill-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
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

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .btn-secondary:hover {
      background: var(--border);
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

    .category-header {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border);
    }

    .category-section {
      margin-bottom: 32px;
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
  </style>
</head>
<body>
  <div class="header">
    <div class="collection-info">
      <div class="collection-icon">📚</div>
      <div class="collection-details">
        <h1 id="collectionName">Loading...</h1>
        <div class="collection-slug" id="collectionSlug">${ctx.collectionSlug}</div>
        <p class="collection-description" id="collectionDescription"></p>
      </div>
    </div>
    <div class="collection-stats">
      <div class="stat">
        <span class="stat-value" id="skillCount">-</span>
        <span class="stat-label">Skills</span>
      </div>
      <div class="stat">
        <span class="stat-value" id="starCount">-</span>
        <span class="stat-label">Stars</span>
      </div>
      <div class="stat">
        <span class="stat-value" id="forkCount">-</span>
        <span class="stat-label">Forks</span>
      </div>
    </div>
  </div>

  <div class="search-container">
    <input type="text" class="search-input" placeholder="Search skills..." id="searchInput">
  </div>

  <div class="content" id="content">
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading collection...</span>
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
        // Handle messages from host
        console.log('[MCP App] Received:', data.method);
        if (data.method === 'ui/initialize') {
          sendRpcNotification('ui/notifications/initialized', {});
          reportSize();
        }
      }
    });

    function reportSize() {
      // Request large size for fullscreen-like experience
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

  <!-- Browser logic -->
  <script>
    let allSkills = [];
    let collectionData = null;

    async function loadCollection() {
      try {
        // Load collection info
        const collResult = await callTool('get_collection', {});
        if (collResult?.content?.[0]?.text) {
          collectionData = JSON.parse(collResult.content[0].text);
          renderCollectionInfo(collectionData);
        }

        // Load skills
        const skillsResult = await callTool('list_skills', { limit: 100 });
        if (skillsResult?.content?.[0]?.text) {
          const data = JSON.parse(skillsResult.content[0].text);
          allSkills = data.skills || [];
          renderSkills(allSkills);
        }
      } catch (error) {
        showToast('Failed to load collection: ' + error.message, 'error');
        document.getElementById('content').innerHTML = \`
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>Failed to load collection</p>
          </div>
        \`;
      }
    }

    function renderCollectionInfo(collection) {
      document.getElementById('collectionName').textContent = collection.name;
      document.getElementById('collectionDescription').textContent = collection.description || '';
      document.getElementById('skillCount').textContent = collection.skillCount || 0;
      document.getElementById('starCount').textContent = collection.starCount || 0;
      document.getElementById('forkCount').textContent = collection.forkCount || 0;
    }

    function renderSkills(skills) {
      if (skills.length === 0) {
        document.getElementById('content').innerHTML = \`
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
            <p>No skills in this collection</p>
            <button class="btn btn-primary" style="margin-top: 16px;" onclick="createSkill()">Create First Skill</button>
          </div>
        \`;
        return;
      }

      // Group by category (first path segment)
      const categories = {};
      skills.forEach(skill => {
        const parts = skill.path.split('/');
        const category = parts.length > 1 ? parts[0] : 'root';
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push(skill);
      });

      let html = '';

      Object.entries(categories).forEach(([category, categorySkills]) => {
        html += \`
          <div class="category-section">
            <div class="category-header">\${category === 'root' ? 'Skills' : category}</div>
            <div class="skills-grid">
              \${categorySkills.map(skill => renderSkillCard(skill)).join('')}
            </div>
          </div>
        \`;
      });

      document.getElementById('content').innerHTML = html;
    }

    function renderSkillCard(skill) {
      return \`
        <div class="skill-card" onclick="openSkill('\${skill.path}')">
          <div class="skill-header">
            <div>
              <div class="skill-name">\${skill.name}</div>
              <div class="skill-path">\${skill.path}</div>
            </div>
          </div>
          <p class="skill-description">\${skill.description || 'No description'}</p>
          <div class="skill-actions">
            <button class="btn btn-primary" onclick="event.stopPropagation(); editSkill('\${skill.path}')">Edit</button>
            <button class="btn btn-secondary" onclick="event.stopPropagation(); viewSkill('\${skill.path}')">View</button>
          </div>
        </div>
      \`;
    }

    function openSkill(path) {
      sendChatMessage('Show me the skill at path: ' + path);
    }

    function editSkill(path) {
      callTool('edit_skill_ui', { skill_path: path });
    }

    function viewSkill(path) {
      callTool('view_skill_ui', { skill_path: path });
    }

    function createSkill() {
      callTool('edit_skill_ui', {});
    }

    // Search functionality
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        if (query) {
          const filtered = allSkills.filter(skill =>
            skill.name.toLowerCase().includes(query) ||
            skill.path.toLowerCase().includes(query) ||
            (skill.description && skill.description.toLowerCase().includes(query))
          );
          renderSkills(filtered);
        } else {
          renderSkills(allSkills);
        }
      }, 200);
    });

    function showToast(message, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + type + ' show';
      setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // Initialize - notify host we're ready
    setTimeout(() => {
      sendRpcNotification('ui/notifications/initialized', {});
      reportSize();
      loadCollection();
    }, 50);
  </script>
</body>
</html>`;
}
