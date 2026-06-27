const API_BASE = '/api/dashboard';
const ADMIN_KEY = prompt('Enter Admin API Key:'); // For production, you'd have a login page.

async function fetchJSON(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'X-Admin-Key': ADMIN_KEY,
      'Content-Type': 'application/json',
    },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    loadTab(btn.dataset.tab);
  });
});

async function loadTab(tab) {
  try {
    switch(tab) {
      case 'overview': await loadOverview(); break;
      case 'economy': await loadEconomy(); break;
      case 'subscriptions': await loadSubscriptions(); break;
      case 'agents': await loadAgents(); break;
      case 'activities': await loadActivities(); break;
    }
  } catch(err) {
    console.error('Error loading tab:', err);
  }
}

// ---------- Overview ----------
async function loadOverview() {
  const data = await fetchJSON('/stats');
  document.getElementById('uptime').textContent = formatUptime(data.uptime);
  document.getElementById('users').textContent = data.users;
  document.getElementById('guilds').textContent = data.guilds;
  document.getElementById('messages').textContent = data.messages;
  document.getElementById('commands').textContent = data.commands;
  document.getElementById('agents').textContent = data.agents;

  // Chart
  const ctx = document.getElementById('overviewChart').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Messages', 'Commands'],
      datasets: [{ data: [data.messages, data.commands], backgroundColor: ['#3b82f6', '#22c55e'] }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#e0e6f0' } } } }
  });
}

// ---------- Economy ----------
async function loadEconomy() {
  const data = await fetchJSON('/economy');
  document.getElementById('totalTokens').textContent = data.totalTokens;
  document.getElementById('dailyCount').textContent = data.dailyCount;
  document.getElementById('dailyTotal').textContent = data.dailyTotal;

  const list = document.getElementById('topBalances');
  list.innerHTML = data.top.map((u, i) => `<li>${i+1}. User ${u.userId}: ${u.balance} tokens</li>`).join('');
}

// ---------- Subscriptions ----------
async function loadSubscriptions() {
  const data = await fetchJSON('/subscriptions');
  document.getElementById('subTotal').textContent = data.total;
  document.getElementById('subActive').textContent = data.active;
  document.getElementById('subVip').textContent = data.vip;
  document.getElementById('subPremium').textContent = data.premium;
  document.getElementById('subExpiring').textContent = data.expiringSoon;
  document.getElementById('activeTrials').textContent = data.activeTrials;
}

// ---------- Agents ----------
async function loadAgents() {
  const data = await fetchJSON('/agents');
  const list = document.getElementById('agentHealth');
  list.innerHTML = Object.entries(data.agents).map(([name, status]) =>
    `<li>${status.error ? '❌' : '✅'} <strong>${name}</strong> — ${status.error || 'Healthy'}</li>`
  ).join('');
}

// ---------- Activities ----------
async function loadActivities() {
  const data = await fetchJSON('/activities');
  const list = document.getElementById('activitiesList');
  list.innerHTML = data.map(a => `<li>[${new Date(a.timestamp).toLocaleString()}] ${a.content}</li>`).join('');
}

// ---------- Helpers ----------
function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

// ---------- Admin Actions ----------
document.getElementById('grantBtn').addEventListener('click', async () => {
  const userId = document.getElementById('grantUserId').value;
  const guildId = document.getElementById('grantGuildId').value;
  const tier = document.getElementById('grantTier').value;
  const days = parseInt(document.getElementById('grantDays').value) || 30;
  if (!userId || !guildId) return alert('Fill all fields');
  try {
    const res = await fetchJSON('/grant', {
      method: 'POST',
      body: JSON.stringify({ userId, guildId, tier, days }),
    });
    document.getElementById('adminResult').innerHTML = `✅ Granted: ${res.success}`;
  } catch(err) {
    document.getElementById('adminResult').innerHTML = `❌ Error: ${err.message}`;
  }
});

document.getElementById('revokeBtn').addEventListener('click', async () => {
  const userId = document.getElementById('revokeUserId').value;
  const guildId = document.getElementById('revokeGuildId').value;
  if (!userId || !guildId) return alert('Fill all fields');
  try {
    const res = await fetchJSON('/revoke', {
      method: 'POST',
      body: JSON.stringify({ userId, guildId }),
    });
    document.getElementById('adminResult').innerHTML = `✅ Revoked: ${res.success}`;
  } catch(err) {
    document.getElementById('adminResult').innerHTML = `❌ Error: ${err.message}`;
  }
});

// Load default tab
loadTab('overview');