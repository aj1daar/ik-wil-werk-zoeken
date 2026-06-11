import { createRouter, createWebHistory } from 'vue-router'
import LoginView          from '../views/LoginView/LoginView.vue'
import DashboardView       from '../views/DashboardView/DashboardView.vue'
import BookmarkedView      from '../views/BookmarkedView/BookmarkedView.vue'
import ProfileView         from '../views/ProfileView/ProfileView.vue'
import RegisterView        from '../views/RegisterView/RegisterView.vue'
import ForgotPasswordView  from '../views/ForgotPasswordView/ForgotPasswordView.vue'
import ResetPasswordView   from '../views/ResetPasswordView/ResetPasswordView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login',           component: LoginView },
    { path: '/register',        component: RegisterView },
    { path: '/forgot-password', component: ForgotPasswordView },
    { path: '/reset-password',  component: ResetPasswordView },
    { path: '/',           component: DashboardView,  meta: { requiresAuth: true } },
    { path: '/bookmarked', component: BookmarkedView, meta: { requiresAuth: true } },
    { path: '/profile',    component: ProfileView,    meta: { requiresAuth: true } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isAuthenticated) return '/login'
  if ((to.path === '/login' || to.path === '/register') && auth.isAuthenticated) return '/'
})

export default router
