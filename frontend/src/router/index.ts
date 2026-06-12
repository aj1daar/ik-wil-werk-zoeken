import { createRouter, createWebHistory } from 'vue-router'
import LoginView          from '../views/LoginView/LoginView.vue'
import HomeView           from '../views/HomeView/HomeView.vue'
import ApplicationsView   from '../views/ApplicationsView/ApplicationsView.vue'
import CompaniesView      from '../views/CompaniesView/CompaniesView.vue'
import ProfileView        from '../views/ProfileView/ProfileView.vue'
import RegisterView       from '../views/RegisterView/RegisterView.vue'
import ForgotPasswordView from '../views/ForgotPasswordView/ForgotPasswordView.vue'
import ResetPasswordView  from '../views/ResetPasswordView/ResetPasswordView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',           component: LoginView },
    { path: '/register',        component: RegisterView },
    { path: '/forgot-password', component: ForgotPasswordView },
    { path: '/reset-password',  component: ResetPasswordView },
    { path: '/',              component: HomeView,         meta: { requiresAuth: true } },
    { path: '/applications',  component: ApplicationsView, meta: { requiresAuth: true } },
    { path: '/companies',     component: CompaniesView,    meta: { requiresAuth: true } },
    { path: '/profile',       component: ProfileView,      meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if ((to.path === '/login' || to.path === '/register') && auth.isAuthenticated) return '/'
})

export default router
