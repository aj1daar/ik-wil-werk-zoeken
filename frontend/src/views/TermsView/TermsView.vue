<script setup lang="ts">
import LegalPage from '../../components/LegalPage/LegalPage.vue'
import { CONTROLLER, PRIVACY_CONTACT } from '../../utils/privacy'
import { TERMS_VERSION } from '../../utils/terms'

// The rules of use. Public, like the privacy notice, and linked from both the
// sign-in and register pages, because Google's consent screen needs a terms
// link that anybody can open without an account.
</script>

<template>
  <LegalPage title="Terms of service" :version="TERMS_VERSION">
    <h2 class="section-title">Who you are agreeing with</h2>
    <p>
      This service is run by {{ CONTROLLER }}, a private person in the Netherlands, as a personal
      project rather than a company. Questions and notices go to
      <a class="auth-link" :href="`mailto:${PRIVACY_CONTACT}`">{{ PRIVACY_CONTACT }}</a>.
    </p>

    <h2 class="section-title">What the service is</h2>
    <p>
      A tracker for your own job search: the applications you have sent, where each one stands,
      what you heard back and when to follow up. Beside it sits a copy of the public register of
      employers recognised by the IND as sponsors for the Highly Skilled Migrant permit, so you
      can see whether a company can sponsor you before you spend an evening on an application.
    </p>
    <p>
      It is free. There is nothing to pay, no advertising, and nothing about you is sold.
    </p>

    <h2 class="section-title">Your account</h2>
    <ul>
      <li>One account per person, and it is yours alone: do not share the password or let somebody else use it.</li>
      <li>Give an email address that actually reaches you, since it is the only way to confirm the account or reset a password.</li>
      <li>You need to be at least 16 years old to have an account here.</li>
      <li>What you put into your account is your responsibility, and so is keeping your own copy of anything you would be sorry to lose.</li>
    </ul>

    <h2 class="section-title">What you may not do</h2>
    <ul>
      <li>Try to reach another person's account, or any part of the service that is not yours.</li>
      <li>Probe, scan or attack the service, or work around the rate limits that protect it.</li>
      <li>Pull the data out in bulk, republish the sponsor register as your own, or resell any part of it.</li>
      <li>Store anything unlawful in it, or use it to harass anybody.</li>
      <li>Automate your use of it in a way that loads the service like many people at once.</li>
    </ul>

    <h2 class="section-title">The sponsor register</h2>
    <p>
      The register is public data published by the IND and copied here as published. It can be
      out of date between updates, a company can be recognised under a name you do not recognise,
      and a recognised sponsor is still free to decide it will not sponsor you. Before you act on
      it in a way that matters, check the register at the IND itself. Nothing here is immigration
      advice.
    </p>

    <h2 class="section-title">Availability</h2>
    <p>
      The service runs on a single server and is maintained in spare time. It can be unavailable,
      lose recent changes to a fault, change the way it works, or stop altogether. No uptime is
      promised. If it is going to shut down for good, notice goes to the address on your account
      so you can take your data with you first.
    </p>

    <h2 class="section-title">Your data</h2>
    <p>
      What is collected, who else sees it and how long it is kept are set out in the
      <router-link class="auth-link" to="/privacy">privacy notice</router-link>, which is part of
      this agreement. Download my data on your profile gives you everything held about you as
      JSON, at any time and without asking.
    </p>

    <h2 class="section-title">Ending it</h2>
    <p>
      You can delete your account whenever you like, from the danger zone on your profile. That
      removes the account and everything attached to it straight away. An account that breaks
      these terms, or that is used to attack the service or other people, can be suspended or
      closed, and where it is reasonable to do so you will hear why first.
    </p>

    <h2 class="section-title">No warranty, and what can be claimed</h2>
    <p>
      The service is provided as it is, with no guarantee that it is correct, available or fit
      for any particular purpose. To the extent Dutch law allows, there is no liability for
      indirect or consequential loss, for lost opportunities, or for data you did not keep a copy
      of elsewhere. Nothing here limits liability for intent or deliberate recklessness, or any
      other liability that cannot be limited by law.
    </p>

    <h2 class="section-title">Changes</h2>
    <p>
      These terms carry a date. When they change, the date changes with them and the current
      version is always the one at this address. Continuing to use the service after a change
      means the new version applies.
    </p>

    <h2 class="section-title">Which law applies</h2>
    <p>
      Dutch law, and any dispute that cannot be settled between us goes to the competent court in
      the Netherlands. If you are a consumer, this does not take away the protection of the
      mandatory rules of the country you live in.
    </p>
  </LegalPage>
</template>
