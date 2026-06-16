<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type AdminUserSummary, type SyncLog } from '../../api'

const users         = ref<AdminUserSummary[]>([])
const loadingUsers  = ref(false)
const usersError    = ref('')

const promoteEmail  = ref('')
const promoting     = ref(false)
const promoteError  = ref('')
const promoteSuccess = ref('')

const reloading     = ref(false)
const reloadError   = ref('')
const reloadSuccess = ref('')

const enriching     = ref(false)
const enrichError   = ref('')
const enrichStatus  = ref('')
const enrichRunning = ref(false)

const syncLogs      = ref<SyncLog[]>([])
const loadingLogs   = ref(false)
const logsError     = ref('')

async function loadUsers() {
  loadingUsers.value = true
  usersError.value   = ''
  try {
    users.value = await api.adminListUsers()
  } catch (e) {
    usersError.value = e instanceof Error ? e.message : 'Failed to load users'
  } finally {
    loadingUsers.value = false
  }
}

async function promote() {
  const email = promoteEmail.value.trim()
  if (!email) return
  promoting.value     = true
  promoteError.value   = ''
  promoteSuccess.value = ''
  try {
    const updated = await api.adminPromote(email)
    promoteSuccess.value = `${updated.email} is now an admin.`
    promoteEmail.value   = ''
    await loadUsers()
  } catch (e) {
    promoteError.value = e instanceof Error ? e.message : 'Promotion failed'
  } finally {
    promoting.value = false
  }
}

async function reloadSponsors() {
  reloading.value     = true
  reloadError.value   = ''
  reloadSuccess.value = ''
  try {
    const res = await api.adminReloadSponsors()
    reloadSuccess.value = res.message
    await loadSyncLogs()
  } catch (e) {
    reloadError.value = e instanceof Error ? e.message : 'Reload failed'
  } finally {
    reloading.value = false
  }
}

async function runEnrichBatch(): Promise<boolean> {
  const res = await api.adminEnrichSponsors()
  enrichStatus.value = res.message
  // "0 remaining" or "already enriched" means done
  return res.message.includes('0 remaining') || res.message.includes('already enriched')
}

async function enrichSponsors() {
  enriching.value    = true
  enrichRunning.value = true
  enrichError.value  = ''
  enrichStatus.value = 'Starting enrichment…'
  try {
    let done = false
    while (!done) {
      done = await runEnrichBatch()
    }
  } catch (e) {
    enrichError.value = e instanceof Error ? e.message : 'Enrichment failed'
  } finally {
    enriching.value    = false
    enrichRunning.value = false
  }
}

async function loadSyncLogs() {
  loadingLogs.value = true
  logsError.value   = ''
  try {
    syncLogs.value = await api.adminGetSyncLogs()
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (!msg.startsWith('404')) {
      logsError.value = msg || 'Failed to load sync logs'
    }
  } finally {
    loadingLogs.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => { loadUsers(); loadSyncLogs() })
</script>

<template>
  <main class="admin-page">
    <h1 class="admin-title">Admin Panel</h1>

    <!-- Promote section -->
    <section class="admin-card" aria-labelledby="promote-heading">
      <h2 id="promote-heading" class="card-title">Promote User to Admin</h2>
      <form class="promote-form" @submit.prevent="promote" novalidate>
        <label for="promote-email" class="field-label">User email</label>
        <div class="promote-row">
          <input
            id="promote-email"
            v-model="promoteEmail"
            type="email"
            class="promote-input"
            placeholder="user@example.com"
            :disabled="promoting"
            autocomplete="off"
          />
          <button type="submit" class="btn-primary" :disabled="promoting || !promoteEmail.trim()">
            {{ promoting ? 'Promoting…' : 'Promote' }}
          </button>
        </div>
        <p v-if="promoteError"   class="form-error"   role="alert">{{ promoteError }}</p>
        <p v-if="promoteSuccess" class="form-success"  role="status">{{ promoteSuccess }}</p>
      </form>
    </section>

    <!-- Reload sponsors section -->
    <section class="admin-card" aria-labelledby="reload-heading">
      <h2 id="reload-heading" class="card-title">Reload IND Sponsor List</h2>
      <p class="card-desc">Fetches the latest IND register and upserts all companies. Fast (~15s). Run Enrich separately after this.</p>
      <button
        class="btn-primary"
        :disabled="reloading"
        @click="reloadSponsors"
      >
        {{ reloading ? 'Reloading…' : 'Reload Sponsors' }}
      </button>
      <p v-if="reloadError"   class="form-error"  role="alert">{{ reloadError }}</p>
      <p v-if="reloadSuccess" class="form-success" role="status">{{ reloadSuccess }}</p>
    </section>

    <!-- Enrich sponsors section -->
    <section class="admin-card" aria-labelledby="enrich-heading">
      <h2 id="enrich-heading" class="card-title">Enrich Companies via AI</h2>
      <p class="card-desc">Runs AI enrichment in batches of 100. Progress is saved after every 20 companies — safe to stop and restart. Click once and it runs until all companies are done.</p>
      <button
        class="btn-primary"
        :disabled="enriching"
        @click="enrichSponsors"
      >
        {{ enriching ? 'Enriching…' : 'Enrich Companies' }}
      </button>
      <p v-if="enrichStatus && !enrichError" class="form-success" role="status">{{ enrichStatus }}</p>
      <p v-if="enrichError" class="form-error" role="alert">{{ enrichError }}</p>
    </section>

    <!-- Sync log table -->
    <section class="admin-card" aria-labelledby="sync-logs-heading">
      <h2 id="sync-logs-heading" class="card-title">Sync History</h2>
      <p v-if="loadingLogs" class="muted">Loading…</p>
      <p v-else-if="logsError" class="form-error" role="alert">{{ logsError }}</p>
      <p v-else-if="syncLogs.length === 0" class="muted">No syncs recorded yet.</p>
      <div v-else class="table-wrap table-wrap--capped">
        <table class="users-table" aria-label="IND sync history">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Source</th>
              <th scope="col">Added</th>
              <th scope="col">Updated</th>
              <th scope="col">Removed</th>
              <th scope="col">Enriched</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in syncLogs" :key="log.id">
              <td>{{ formatDate(log.syncedAt) }}</td>
              <td>
                <span :class="['role-badge', log.triggerSource === 'admin' ? 'role-badge--admin' : 'role-badge--user']">
                  {{ log.triggerSource }}
                </span>
              </td>
              <td class="num-cell">+{{ log.added }}</td>
              <td class="num-cell">{{ log.updated }}</td>
              <td class="num-cell removed-cell">{{ log.removed > 0 ? `-${log.removed}` : '0' }}</td>
              <td class="num-cell">{{ log.enriched }}</td>
              <td class="num-cell">{{ log.totalAfterSync }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Users table -->
    <section class="admin-card" aria-labelledby="users-heading">
      <h2 id="users-heading" class="card-title">All Users</h2>
      <p v-if="loadingUsers" class="muted">Loading…</p>
      <p v-else-if="usersError" class="form-error" role="alert">{{ usersError }}</p>
      <div v-else class="table-wrap">
        <table class="users-table" aria-label="Registered users">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Verified</th>
              <th scope="col">Joined</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.userId">
              <td>{{ u.firstName }} {{ u.lastName }}</td>
              <td>{{ u.email }}</td>
              <td>
                <span :class="['role-badge', u.role === 'admin' ? 'role-badge--admin' : 'role-badge--user']">
                  {{ u.role }}
                </span>
              </td>
              <td>{{ u.emailVerified ? 'Yes' : 'No' }}</td>
              <td>{{ new Date(u.createdAt).toLocaleDateString('nl-NL') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>
</template>

<style scoped>
.admin-page {
  max-width: 900px;
  margin: 10px auto 16px;
  padding: 2rem 1.5rem 4rem;
  border-radius: 16px;
  box-shadow: var(--island-shadow);
  background: var(--col-bg);
}

.admin-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--col-text);
  margin-bottom: 2rem;
}

.admin-card {
  background: var(--col-surface);
  border: 1px solid var(--col-border);
  border-radius: 10px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow:
    0 1px 3px  color-mix(in srgb, var(--col-text) 6%, transparent),
    0 4px 16px color-mix(in srgb, var(--col-text) 9%, transparent);
}

.card-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--col-text);
  margin: 0 0 1rem;
}

.card-desc {
  font-size: 0.875rem;
  color: var(--col-muted);
  margin: 0 0 1rem;
}

.promote-form { display: flex; flex-direction: column; gap: 0.5rem; }

.field-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--col-text);
}

.promote-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.promote-input {
  flex: 1;
  padding: 0.55rem 0.85rem;
  border: 1px solid var(--col-border);
  border-radius: 6px;
  font-size: 0.9rem;
  background: var(--col-bg);
  color: var(--col-text);
  outline: none;
  transition: border-color 0.15s;
}

.promote-input:focus { border-color: var(--col-accent); }

.btn-primary {
  background: var(--col-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.55rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}

.btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-primary:not(:disabled):hover { opacity: 0.88; }

.form-error   { font-size: 0.85rem; color: var(--col-error); margin: 0.25rem 0 0; }
.form-success { font-size: 0.85rem; color: #2a9d58; margin: 0.25rem 0 0; }
.muted        { color: var(--col-muted); font-size: 0.9rem; }

.table-wrap { overflow-x: auto; }
.table-wrap--capped { max-height: 220px; overflow-y: auto; overflow-x: hidden; }
.table-wrap--capped thead th { position: sticky; top: 0; background: var(--col-surface); z-index: 1; }

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.users-table th,
.users-table td {
  padding: 0.6rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--col-border);
  color: var(--col-text);
  white-space: nowrap;
}

.users-table th {
  font-weight: 600;
  color: var(--col-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.users-table tbody tr:last-child td { border-bottom: none; }

.role-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
}

.role-badge--admin {
  background: #fff3cd;
  color: #7a5300;
}

.role-badge--user {
  background: var(--col-subtle);
  color: var(--col-muted);
}

.num-cell { text-align: right; font-variant-numeric: tabular-nums; }
.removed-cell { color: var(--col-error); }

@media (max-width: 600px) {
  .admin-page { margin: 0; border-radius: 0; box-shadow: none; }
  .promote-row { flex-direction: column; align-items: stretch; }
}
</style>
