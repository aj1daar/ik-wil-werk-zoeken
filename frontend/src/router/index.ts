import { createRouter, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?:  boolean
    requiresAdmin?: boolean
    title?:         string
  }
}
import LoginView          from '../views/LoginView/LoginView.vue'
import HomeView           from '../views/HomeView/HomeView.vue'
import ApplicationsView   from '../views/ApplicationsView/ApplicationsView.vue'
import CompaniesView      from '../views/CompaniesView/CompaniesView.vue'
import ProfileView        from '../views/ProfileView/ProfileView.vue'
import RegisterView       from '../views/RegisterView/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView/ForgotPasswordView.vue'
import ResetPasswordView  from '../views/ResetPasswordView/ResetPasswordView.vue'
import PrivacyView        from '../views/PrivacyView/PrivacyView.vue'
import VerifyEmailView           from '../views/VerifyEmailView/VerifyEmailView.vue'
import ConfirmEmailChangeView   from '../views/ConfirmEmailChangeView/ConfirmEmailChangeView.vue'
import AdminView                from '../views/AdminView/AdminView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',           component: LoginView,          meta: { title: 'Sign In — IWWZ' } },
    { path: '/register',        component: RegisterView,       meta: { title: 'Create Account — IWWZ' } },
    { path: '/forgot-password', component: ForgotPasswordView, meta: { title: 'Forgot Password — IWWZ' } },
    { path: '/reset-password',  component: ResetPasswordView,  meta: { title: 'Reset Password — IWWZ' } },
    { path: '/privacy',       component: PrivacyView,     meta: { title: 'Privacy Policy — IWWZ' } },
    { path: '/verify-email',         component: VerifyEmailView,          meta: { title: 'Verify Email — IWWZ' } },
    { path: '/confirm-email-change', component: ConfirmEmailChangeView,   meta: { title: 'Confirm Email Change — IWWZ' } },
    { path: '/',              component: HomeView,         meta: { requiresAuth: true, title: 'Dashboard — IWWZ' } },
    { path: '/applications',  component: ApplicationsView, meta: { requiresAuth: true, title: 'Applications — IWWZ' } },
    { path: '/companies',     component: CompaniesView,    meta: { requiresAuth: true, title: 'Companies — IWWZ' } },
    { path: '/profile',       component: ProfileView,      meta: { requiresAuth: true, title: 'Profile — IWWZ' } },
    { path: '/admin',         component: AdminView,        meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin Panel — IWWZ' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if (to.meta.requiresAdmin && auth.user?.role !== 'admin') return '/'
  if ((to.path === '/login' || to.path === '/register') && auth.isAuthenticated) return '/'
})

router.afterEach((to) => {
  document.title = (to.meta.title as string | undefined) ?? 'IWWZ'
})

export default router
