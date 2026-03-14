import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomePage.vue'),
      meta: { title: 'Workout' },
    },
    {
      path: '/workout',
      name: 'workout',
      component: () => import('../views/WorkoutPage.vue'),
      meta: { title: 'Workout' },
    },
    {
      path: '/history',
      name: 'history',
      component: () => import('../views/HistoryPage.vue'),
      meta: { title: 'History' },
    },
  ],
})

export default router
