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
import VerifyEmailView           from '../views/VerifyEmailView/VerifyEmailView.vue'
import ConfirmEmailChangeView   from '../views/ConfirmEmailChangeView/ConfirmEmailChangeView.vue'
import AdminView                from '../views/AdminView/AdminView.vue'
import { useAuthStore } from '../stores/auth'
import { pageTitle } from './title'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',           component: LoginView,          meta: { title: 'Sign in' } },
    { path: '/register',        component: RegisterView,       meta: { title: 'Create account' } },
    { path: '/forgot-password', component: ForgotPasswordView, meta: { title: 'Forgot password' } },
    { path: '/reset-password',  component: ResetPasswordView,  meta: { title: 'Reset password' } },
    { path: '/verify-email',         component: VerifyEmailView,          meta: { title: 'Verify email' } },
    { path: '/confirm-email-change', component: ConfirmEmailChangeView,   meta: { title: 'Confirm email change' } },
    { path: '/',              component: HomeView,         meta: { requiresAuth: true, title: 'Home' } },
    { path: '/applications',  component: ApplicationsView, meta: { requiresAuth: true, title: 'My applications' } },
    { path: '/companies',     component: CompaniesView,    meta: { requiresAuth: true, title: 'Companies' } },
    { path: '/profile',       component: ProfileView,      meta: { requiresAuth: true, title: 'Profile' } },
    { path: '/admin',         component: AdminView,        meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin panel' } },
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
  document.title = pageTitle(to.meta.title)
})

export default router
