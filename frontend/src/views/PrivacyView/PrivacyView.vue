<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppLogo from '../../components/AppLogo/AppLogo.vue'
import { CONTROLLER, PRIVACY_CONTACT, PRIVACY_VERSION } from '../../utils/privacy'

// The notice itself. Reachable without an account, because somebody deciding
// whether to make one has to be able to read it first.
const router = useRouter()
const goBack = () => (window.history.length > 1 ? router.back() : router.push('/login'))
</script>

<template>
  <div class="privacy-page">
    <div class="privacy-brand">
      <AppLogo :size="40" />
    </div>

    <article class="card privacy-card">
      <h1 class="privacy-title">Privacy notice</h1>
      <p class="privacy-meta">Version {{ PRIVACY_VERSION }}</p>

      <h2 class="section-title">Who is responsible</h2>
      <p>
        {{ CONTROLLER }} runs this service and decides what happens to the data in it.
        Questions, requests and complaints go to
        <a class="auth-link" :href="`mailto:${PRIVACY_CONTACT}`">{{ PRIVACY_CONTACT }}</a>.
      </p>

      <h2 class="section-title">What is collected, and why</h2>
      <p>
        An account needs an email address and a password. The address identifies the account,
        carries the verification link, and is the only way to reset a password. The password is
        never stored: what is kept is a PBKDF2-SHA256 hash of it.
      </p>
      <p>
        Everything else is what you put in: the applications you track, their companies,
        positions, dates, locations and links, the status history behind them, the companies you
        mark as interesting or hidden, and a log of the changes you make to an application, which
        is what lets the app show you what changed and when. A name and job-search preferences
        are optional and live on your profile; nothing asks for them when you register.
      </p>
      <p>
        Signing in with Google adds the Google account id, so the two can be linked, and the
        address and name Google holds for you.
      </p>

      <h2 class="section-title">On what basis</h2>
      <p>
        Running the account and the tracker is performance of the agreement between us, which is
        what you accept when you create an account. Keeping it secure, including rate limiting and
        the logs that support it, rests on a legitimate interest in a service that is not abused.
        Nothing here is used for advertising, profiling or analytics, and nothing is sold.
      </p>

      <h2 class="section-title">Who else sees it</h2>
      <ul class="privacy-list">
        <li>Hetzner, Germany, which hosts the servers and the database.</li>
        <li>Cloudflare, which serves the pages and passes requests through, and therefore sees IP addresses.</li>
        <li>Resend, in the United States, which delivers verification and password-reset emails; it sees your address and the link.</li>
        <li>Google, if you choose the Google button, which learns that you signed in to this service.</li>
      </ul>
      <p>
        Nobody else. The register of recognised sponsors is public data from the IND and holds
        nothing about you.
      </p>

      <h2 class="section-title">How long it is kept</h2>
      <p>
        Until you delete your account. Deleting it removes the account and everything attached to
        it: applications, status history, change log and company lists, in the same moment and
        without a copy left behind. Database backups are kept for a short rotation and age out on
        their own.
      </p>

      <h2 class="section-title">What you can do</h2>
      <ul class="privacy-list">
        <li>See everything held about you: Download my data on your profile gives the lot as JSON.</li>
        <li>Correct it: your profile edits what is yours to edit.</li>
        <li>Delete it: Danger zone on your profile, immediate and final.</li>
        <li>Object, or ask for a copy in another form: write to the address above.</li>
      </ul>
      <p>
        If you think this is being handled badly, you can complain to the Dutch data protection
        authority, the Autoriteit Persoonsgegevens.
      </p>

      <h2 class="section-title">What is stored in your browser</h2>
      <p>
        A session token for as long as the tab is open, and your choice of light or dark mode.
        There are no advertising or analytics cookies. The sign-in and register pages load
        Google's sign-in script, which is the only code here that comes from somebody else.
      </p>

      <h2 class="section-title">Changes</h2>
      <p>
        This notice carries a version. When it changes in a way that matters, the version changes
        with it, and your account records which version you accepted.
      </p>

      <button type="button" class="btn-secondary privacy-back" @click="goBack">Go back</button>
    </article>
  </div>
</template>

<style scoped>
.privacy-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.privacy-card { width: 100%; }

.privacy-title { font-size: 1.5rem; font-weight: 600; color: var(--col-text); margin: 0; }
.privacy-meta  { font-size: .8125rem; color: var(--col-subtle); margin: .25rem 0 1.5rem; }

.privacy-card p {
  font-size: .875rem; line-height: 1.6; color: var(--col-muted); margin: 0 0 1rem;
}

.privacy-list {
  list-style: disc; padding-left: 1.25rem; margin: 0 0 1rem;
  display: flex; flex-direction: column; gap: .375rem;
  font-size: .875rem; line-height: 1.6; color: var(--col-muted);
}

.privacy-back { margin-top: .5rem; }

@media (max-width: 767px) {
  .privacy-page { padding: 1rem .75rem 2rem; }
  .privacy-back { width: 100%; justify-content: center; }
}
</style>
