import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'
import Inventory from './views/Inventory.vue'
import Orders from './views/Orders.vue'
import Demand from './views/Demand.vue'
import Spending from './views/Spending.vue'
import Restocking from './views/Restocking.vue'
import Reports from './views/Reports.vue'
import Backlog from './views/Backlog.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard },
    { path: '/inventory', component: Inventory },
    { path: '/orders', component: Orders },
    // Restocking only follows warehouse and category; hide the filters it ignores.
    { path: '/restocking', component: Restocking, meta: { hiddenFilters: ['period', 'status'] } },
    { path: '/demand', component: Demand },
    { path: '/spending', component: Spending },
    { path: '/reports', component: Reports },
    { path: '/backlog', component: Backlog }
  ]
})

const app = createApp(App)
app.use(router)
app.mount('#app')
