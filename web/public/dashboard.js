/**
 * Ultra3Vault Dashboard – B2B Client Portal
 * Handles Discord OAuth2, guild list, webhook configuration, and admin actions.
 */

// ─── DOM Helpers ───
const $ = (id) => document.getElementById(id);

// ─── Check Authentication ───
async function checkAuth() {
  try {
    const res = await fetch('/api/user');
    if (!res.ok) {
      // Not authenticated – show login
      $('loginScreen').style.display = 'flex';
      $('dashboardContent').style.display = 'none';
      return false;
    }
    const user = await res.json();
    $('userName').textContent = user.username || user.global_name || 'User';
    if (user.avatar) {
      $('userAvatar').src = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`;
    }
    $('loginScreen').style.display = 'none';
    $('dashboardContent').style.display = 'block';
    return true;
  } catch (err) {
    $('loginScreen').style.display = 'flex';
    $('dashboardContent').style.display = 'none';
    return false;
  }
}

// ─── Tab Switching ───
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    const tabId = `tab-${btn.dataset.tab}`;
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
    // Refresh data on tab switch
    if (btn.dataset.tab === 'servers') loadGuilds();
    if (btn.dataset.tab === 'agents') loadAgents();
  });
});

// ─── Load Overview Stats ───
async function loadOverview() {
  try {
    const res = await fetch('/api/dashboard/stats', {
      headers: { 'X-Admin-Key': localStorage.getItem('adminKey') || '' }
    });
    if (!res.ok) return;
    const data = await res.json();
    $('uptime').textContent = formatUptime(data.uptime);
    $('users').textContent = data.users ?? '-';
    $('guilds').textContent = data.guilds ?? '-';
    $('messages').textContent = data.messages ?? '-';
    $('commands').textContent = data.commands ?? '-';
    $('agents').textContent = data.agents ?? '-';
  } catch (err) {
    console.error('Overview load error:', err);
  }
}

function formatUptime(seconds) {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

// ─── Load Subscriptions Stats ───
async function loadSubscriptions() {
  try {
    const res = await fetch('/api/dashboard/subscriptions', {
      headers: { 'X-Admin-Key': localStorage.getItem('adminKey') || '' }
    });
    if (!res.ok) return;
    const data = await res.json();
    $('subTotal').textContent = data.total ?? '-';
    $('subActive').textContent = data.active ?? '-';
    $('subVip').textContent = data.vip ?? '-';
    $('subPremium').textContent = data.premium ?? '-';
    $('subExpiring').textContent = data.expiringSoon ?? '-';
    $('activeTrials').textContent = data.activeTrials ?? '-';
  } catch (err) {
    console.error('Subscriptions load error:', err);
  }
}

// ─── Load Agents Health ───
async function loadAgents() {
  try {
    const res = await fetch('/api/dashboard/agents', {
      headers: { 'X-Admin-Key': localStorage.getItem('adminKey') || '' }
    });
    if (!res.ok) throw new Error('Failed to fetch agents');
    const data = await res.json();
    const container = $('agentHealth');
    container.innerHTML = '';
    if (!data || Object.keys(data).length === 0) {
      container.innerHTML = '<div class="empty">No agent data available.</div>';
      return;
    }
    for (const [name, status] of Object.entries(data)) {
      const div = document.createElement('div');
      div.className = 'list-item';
      const isHealthy = status === 'healthy' || status === 'online' || status === true;
      div.innerHTML = `
        <span class="label">${name}</span>
        <span class="badge ${isHealthy ? 'success' : 'danger'}">${isHealthy ? '✅ Healthy' : '⚠️ Unhealthy'}</span>
      `;
      container.appendChild(div);
    }
  } catch (err) {
    console.error('Agents load error:', err);
    $('agentHealth').innerHTML = `<div class="empty">Error loading agents: ${err.message}</div>`;
  }
}

// ─── Load Guilds (B2B Server List) ───
async function loadGuilds() {
  try {
    const res = await fetch('/api/user/guilds');
    if (!res.ok) throw new Error('Failed to fetch guilds');
    const data = await res.json();
    const container = $('guildList');
    container.innerHTML = '';

    if (!data.guilds || data.guilds.length === 0) {
      container.innerHTML = '<div class="empty">No servers where you have Administrator permissions.</div>';
      return;
    }

    for (const guild of data.guilds) {
      // Fetch subscription status for each guild
      let statusHtml = '<span class="badge muted">No config</span>';
      let webhookInfo = '<span class="sub" style="color:var(--text-muted);font-size:12px;">No webhook set</span>';
      let agentsInfo = '';

      try {
        const subRes = await fetch(`/api/subscription/status/${guild.id}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          if (subData.subscription) {
            const sub = subData.subscription;
            const isActive = sub.expiresAt > Date.now();
            statusHtml = isActive
              ? `<span class="badge success">✅ Active</span>`
              : `<span class="badge danger">⛔ Expired</span>`;
            if (sub.webhook_url) {
              webhookInfo = `<span class="sub" style="color:var(--text-secondary);font-size:12px;">🔗 ${sub.webhook_url.slice(0, 40)}...</span>`;
            }
            if (sub.agentAccess) {
              const agents = typeof sub.agentAccess === 'string' ? JSON.parse(sub.agentAccess) : sub.agentAccess;
              agentsInfo = `<span class="sub" style="color:var(--text-muted);font-size:11px;">📡 ${agents.join(', ')}</span>`;
            }
          }
        }
      } catch (e) { /* ignore */ }

      const card = document.createElement('div');
      card.className = 'list-item';
      card.innerHTML = `
        <div>
          <strong>${guild.name}</strong>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">
            ${statusHtml}
            ${webhookInfo}
            ${agentsInfo}
          </div>
        </div>
        <button class="btn-primary" onclick="openConfigModal('${guild.id}', '${guild.name}')" style="font-size:12px; padding:6px 14px;">
          ⚙️ Configure
        </button>
      `;
      container.appendChild(card);
    }
  } catch (err) {
    console.error('Guilds load error:', err);
    $('guildList').innerHTML = `<div class="empty">Error loading servers: ${err.message}</div>`;
  }
}

// ─── Config Modal ───
function openConfigModal(guildId, guildName) {
  currentGuildId = guildId;
  currentGuildName = guildName;
  $('modalTitle').textContent = `Configure ${guildName}`;
  $('modalGuildId').value = guildId;
  $('modalWebhookUrl').value = '';
  document.querySelectorAll('.agent-checkbox').forEach(cb => cb.checked = false);
  $('modalTestResult').innerHTML = '';

  // Load existing config
  fetch(`/api/subscription/status/${guildId}`)
    .then(res => res.json())
    .then(data => {
      if (data.subscription) {
        $('modalWebhookUrl').value = data.subscription.webhook_url || '';
        if (data.subscription.agentAccess) {
          const agents = typeof data.subscription.agentAccess === 'string'
            ? JSON.parse(data.subscription.agentAccess)
            : data.subscription.agentAccess;
          document.querySelectorAll('.agent-checkbox').forEach(cb => {
            cb.checked = agents.includes(cb.value);
          });
        }
      }
    })
    .catch(() => {});

  $('configModal').style.display = 'flex';
}

function closeConfigModal() {
  $('configModal').style.display = 'none';
}

// ─── Test Webhook ───
$('modalTestBtn').addEventListener('click', async () => {
  const url = $('modalWebhookUrl').value.trim();
  if (!url) {
    $('modalTestResult').innerHTML = '<div class="badge danger" style="padding:8px;">Please enter a webhook URL.</div>';
    return;
  }
  $('modalTestBtn').textContent = '⏳ Testing...';
  $('modalTestBtn').disabled = true;
  try {
    const res = await fetch('/api/webhook/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: url })
    });
    const result = await res.json();
    $('modalTestResult').innerHTML = res.ok
      ? '<div class="badge success" style="padding:8px;">✅ Test successful!</div>'
      : `<div class="badge danger" style="padding:8px;">❌ ${result.error || 'Test failed'}</div>`;
  } catch (err) {
    $('modalTestResult').innerHTML = `<div class="badge danger" style="padding:8px;">❌ Error: ${err.message}</div>`;
  }
  $('modalTestBtn').textContent = 'Test';
  $('modalTestBtn').disabled = false;
});

// ─── Save Configuration ───
$('modalSaveBtn').addEventListener('click', async () => {
  const guildId = $('modalGuildId').value;
  const webhookUrl = $('modalWebhookUrl').value.trim();
  const agentCheckboxes = document.querySelectorAll('.agent-checkbox:checked');
  const agentAccess = Array.from(agentCheckboxes).map(cb => cb.value);

  if (!webhookUrl) {
    alert('Please enter a webhook URL.');
    return;
  }
  if (agentAccess.length === 0) {
    alert('Please select at least one agent.');
    return;
  }

  $('modalSaveBtn').textContent = '⏳ Saving...';
  $('modalSaveBtn').disabled = true;

  try {
    const res = await fetch('/api/webhook/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guildId, webhookUrl, agentAccess })
    });
    const result = await res.json();
    if (res.ok) {
      alert('✅ Configuration saved successfully! You will now receive data feeds.');
      closeConfigModal();
      loadGuilds();
    } else {
      alert(`❌ Error: ${result.error}`);
    }
  } catch (err) {
    alert(`❌ Error: ${err.message}`);
  } finally {
    $('modalSaveBtn').textContent = 'Save Configuration';
    $('modalSaveBtn').disabled = false;
  }
});

// ─── Admin Actions ───
$('grantBtn').addEventListener('click', async () => {
  const userId = $('grantUserId').value.trim();
  const guildId = $('grantGuildId').value.trim();
  const tier = $('grantTier').value;
  const days = parseInt($('grantDays').value) || 30;

  if (!userId || !guildId) {
    showAdminResult('Please fill in all fields.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/dashboard/grant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': localStorage.getItem('adminKey') || ''
      },
      body: JSON.stringify({ userId, guildId, tier, days })
    });
    const result = await res.json();
    if (res.ok) {
      showAdminResult(`✅ Granted ${tier} to ${userId} for ${days} days. Expires: ${new Date(result.expiresAt).toLocaleString()}`, 'success');
      loadSubscriptions();
    } else {
      showAdminResult(`❌ Error: ${result.error}`, 'error');
    }
  } catch (err) {
    showAdminResult(`❌ Error: ${err.message}`, 'error');
  }
});

$('revokeBtn').addEventListener('click', async () => {
  const userId = $('revokeUserId').value.trim();
  const guildId = $('revokeGuildId').value.trim();

  if (!userId || !guildId) {
    showAdminResult('Please fill in all fields.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/dashboard/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': localStorage.getItem('adminKey') || ''
      },
      body: JSON.stringify({ userId, guildId })
    });
    const result = await res.json();
    if (res.ok) {
      showAdminResult(`✅ Revoked subscription for ${userId}`, 'success');
      loadSubscriptions();
    } else {
      showAdminResult(`❌ Error: ${result.error}`, 'error');
    }
  } catch (err) {
    showAdminResult(`❌ Error: ${err.message}`, 'error');
  }
});

function showAdminResult(msg, type) {
  const el = $('adminResult');
  el.textContent = msg;
  el.className = type;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

// ─── Init ───
(async function init() {
  const authenticated = await checkAuth();
  if (authenticated) {
    loadOverview();
    loadSubscriptions();
    loadAgents();
    loadGuilds();

    // Auto-refresh every 60 seconds
    setInterval(() => {
      loadOverview();
      loadSubscriptions();
    }, 60000);
  }
})();

// ─── Close modal on click outside ───
document.getElementById('configModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeConfigModal();
});

// ─── ESC to close modal ───
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeConfigModal();
});