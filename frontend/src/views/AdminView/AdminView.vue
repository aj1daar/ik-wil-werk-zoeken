<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, type AdminUserSummary } from '../../api'
import AppNavbar from '../../components/AppNavbar/AppNavbar.vue'

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
  } catch (e) {
    reloadError.value = e instanceof Error ? e.message : 'Reload failed'
  } finally {
    reloading.value = false
  }
}

onMounted(loadUsers)
</script>

<template>
  <AppNavbar />

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
      <p class="card-desc">Fetches the latest IND register, upserts all companies, and enriches new entries via LLM. This can take a few minutes.</p>
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
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;
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

@media (max-width: 600px) {
  .promote-row { flex-direction: column; align-items: stretch; }
}
</style>
