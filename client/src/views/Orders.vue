<template>
  <div class="orders">
    <div class="page-header">
      <h2>{{ t('orders.title') }}</h2>
      <p>{{ t('orders.description') }}</p>
    </div>

    <div class="card" data-testid="restock-orders-section">
      <div class="card-header">
        <h3 class="card-title">{{ t('orders.restockOrders.title') }} ({{ restockOrders.length }})</h3>
      </div>
      <div v-if="restockError" class="error">{{ restockError }}</div>
      <div v-else-if="restockLoading && restockOrders.length === 0" class="loading">{{ t('common.loading') }}</div>
      <div v-else-if="restockOrders.length === 0" class="restock-empty" data-testid="restock-orders-empty">
        {{ t('orders.restockOrders.empty') }}
      </div>
      <div v-else class="table-container">
        <table class="restock-table">
          <thead>
            <tr>
              <th class="col-order-number">{{ t('orders.restockOrders.table.orderNumber') }}</th>
              <th class="col-customer">{{ t('orders.restockOrders.table.warehouse') }}</th>
              <th class="col-date">{{ t('orders.restockOrders.table.placed') }}</th>
              <th class="col-items">{{ t('orders.restockOrders.table.items') }}</th>
              <th class="col-value">{{ t('orders.restockOrders.table.totalCost') }}</th>
              <th class="col-date">{{ t('orders.restockOrders.table.leadTime') }}</th>
              <th class="col-date">{{ t('orders.restockOrders.table.expectedArrival') }}</th>
              <th class="col-status">{{ t('orders.restockOrders.table.status') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="ro in restockOrders"
              :key="ro.order_number"
              :data-testid="`restock-order-row-${ro.order_number}`"
            >
              <td class="col-order-number"><strong>{{ ro.order_number }}</strong></td>
              <td class="col-customer">{{ translateWarehouse(ro.warehouse) }}</td>
              <td class="col-date">{{ formatDate(ro.placed_at) }}</td>
              <td class="col-items">
                <details class="items-details">
                  <summary class="items-summary">
                    {{ itemsLabel(ro.items.length) }}
                  </summary>
                  <div class="items-dropdown">
                    <div v-for="item in ro.items" :key="item.sku" class="item-entry">
                      <span class="item-name">{{ translateProductName(item.name) }}</span>
                      <span class="item-meta">{{ translateCategory(item.category) }} - {{ t('orders.quantity') }}: {{ item.quantity }} @ {{ formatExact(item.unit_cost) }}</span>
                    </div>
                  </div>
                </details>
              </td>
              <td class="col-value"><strong>{{ formatExact(ro.total_cost) }}</strong></td>
              <td class="col-date">{{ t('orders.restockOrders.leadTimeDays', { count: ro.lead_time_days }) }}</td>
              <td class="col-date">{{ formatDate(ro.expected_arrival) }}</td>
              <td class="col-status">
                <span class="badge info">{{ t('orders.restockOrders.status.submitted') }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else>
      <div class="stats-grid">
        <div class="stat-card success">
          <div class="stat-label">{{ t('status.delivered') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Delivered').length }}</div>
        </div>
        <div class="stat-card info">
          <div class="stat-label">{{ t('status.shipped') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Shipped').length }}</div>
        </div>
        <div class="stat-card warning">
          <div class="stat-label">{{ t('status.processing') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Processing').length }}</div>
        </div>
        <div class="stat-card danger">
          <div class="stat-label">{{ t('status.backordered') }}</div>
          <div class="stat-value">{{ getOrdersByStatus('Backordered').length }}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ t('orders.allOrders') }} ({{ orders.length }})</h3>
        </div>
        <div class="table-container">
          <table class="orders-table">
            <thead>
              <tr>
                <th class="col-order-number">{{ t('orders.table.orderNumber') }}</th>
                <th class="col-customer">{{ t('orders.table.customer') }}</th>
                <th class="col-items">{{ t('orders.table.items') }}</th>
                <th class="col-status">{{ t('orders.table.status') }}</th>
                <th class="col-date">{{ t('orders.table.orderDate') }}</th>
                <th class="col-date">{{ t('orders.table.expectedDelivery') }}</th>
                <th class="col-value">{{ t('orders.table.totalValue') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="order in orders" :key="order.id">
                <td class="col-order-number"><strong>{{ order.order_number }}</strong></td>
                <td class="col-customer">{{ translateCustomerName(order.customer) }}</td>
                <td class="col-items">
                  <details class="items-details">
                    <summary class="items-summary">
                      {{ itemsLabel(order.items.length) }}
                    </summary>
                    <div class="items-dropdown">
                      <div v-for="(item, idx) in order.items" :key="idx" class="item-entry">
                        <span class="item-name">{{ translateProductName(item.name) }}</span>
                        <span class="item-meta">{{ t('orders.quantity') }}: {{ item.quantity }} @ {{ currencySymbol }}{{ item.unit_price }}</span>
                      </div>
                    </div>
                  </details>
                </td>
                <td class="col-status">
                  <span :class="['badge', getOrderStatusClass(order.status)]">
                    {{ t(`status.${order.status.toLowerCase()}`) }}
                  </span>
                </td>
                <td class="col-date">{{ formatDate(order.order_date) }}</td>
                <td class="col-date">{{ formatDate(order.expected_delivery) }}</td>
                <td class="col-value"><strong>{{ currencySymbol }}{{ order.total_value.toLocaleString() }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, watch, computed } from 'vue'
import { api } from '../api'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'
import { formatCurrencyWithDecimals } from '../utils/currency'

export default {
  name: 'Orders',
  setup() {
    const { t, currentCurrency, translateProductName, translateCustomerName, translateWarehouse } = useI18n()

    const currencySymbol = computed(() => {
      return currentCurrency.value === 'JPY' ? '¥' : '$'
    })
    const loading = ref(true)
    const error = ref(null)
    const orders = ref([])
    const restockOrders = ref([])
    const restockError = ref(null)
    const restockLoading = ref(true)
    // Ignores a slow earlier response that would overwrite a newer filter's result.
    let restockRequestId = 0

    // Use shared filters
    const {
      selectedPeriod,
      selectedLocation,
      selectedCategory,
      selectedStatus,
      getCurrentFilters
    } = useFilters()

    const loadOrders = async () => {
      try {
        loading.value = true
        const filters = getCurrentFilters()
        const fetchedOrders = await api.getOrders(filters)

        // Sort orders by order_date (earliest first)
        orders.value = fetchedOrders.sort((a, b) => {
          const dateA = new Date(a.order_date)
          const dateB = new Date(b.order_date)
          return dateA - dateB
        })
      } catch (err) {
        error.value = 'Failed to load orders: ' + err.message
      } finally {
        loading.value = false
      }
    }

    // Restock Orders are a supplier-side concept with no order date/status of the customer kind,
    // so only warehouse and category are sent; period and status must not hide them.
    const loadRestockOrders = async () => {
      const myRequest = ++restockRequestId
      restockLoading.value = true
      try {
        const result = await api.getRestockOrders({
          warehouse: selectedLocation.value,
          category: selectedCategory.value
        })
        if (myRequest !== restockRequestId) return
        restockOrders.value = result
        restockError.value = null
      } catch (err) {
        if (myRequest !== restockRequestId) return
        restockError.value = t('orders.restockOrders.loadError', { message: err.message })
      } finally {
        if (myRequest === restockRequestId) restockLoading.value = false
      }
    }

    // Watch for filter changes and reload data
    watch([selectedPeriod, selectedLocation, selectedCategory, selectedStatus], () => {
      loadOrders()
    })

    watch([selectedLocation, selectedCategory], loadRestockOrders)

    // The i18n helper has no plural support, so pick the key by count (ja uses the same string).
    const itemsLabel = (count) =>
      t(count === 1 ? 'orders.itemsCountOne' : 'orders.itemsCountOther', { count })

    const formatExact = (amount) => formatCurrencyWithDecimals(amount, currentCurrency.value, 2)

    const translateCategory = (category) => {
      const categoryMap = {
        'Circuit Boards': t('categories.circuitBoards'),
        'Sensors': t('categories.sensors'),
        'Actuators': t('categories.actuators'),
        'Controllers': t('categories.controllers'),
        'Power Supplies': t('categories.powerSupplies')
      }
      return categoryMap[category] || category
    }

    const getOrdersByStatus = (status) => {
      return orders.value.filter(order => order.status === status)
    }

    const getOrderStatusClass = (status) => {
      const statusMap = {
        'Delivered': 'success',
        'Shipped': 'info',
        'Processing': 'warning',
        'Backordered': 'danger'
      }
      return statusMap[status] || 'info'
    }

    const formatDate = (dateString) => {
      const { currentLocale } = useI18n()
      if (!dateString || isNaN(new Date(dateString).getTime())) return '-'

      const locale = currentLocale.value === 'ja' ? 'ja-JP' : 'en-US'
      return new Date(dateString).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    }

    onMounted(() => {
      loadOrders()
      loadRestockOrders()
    })

    return {
      t,
      loading,
      error,
      orders,
      getOrdersByStatus,
      getOrderStatusClass,
      formatDate,
      formatExact,
      itemsLabel,
      restockLoading,
      restockOrders,
      restockError,
      translateWarehouse,
      translateCategory,
      currencySymbol,
      translateProductName,
      translateCustomerName
    }
  }
}
</script>

<style scoped>
/* Fixed table layout to prevent column shifting */
.orders-table {
  table-layout: fixed;
  width: 100%;
}

/* Column widths */
.col-order-number {
  width: 130px;
}

.col-customer {
  width: 180px;
}

.col-items {
  width: 200px;
}

.col-status {
  width: 130px;
}

.col-date {
  width: 140px;
}

.col-value {
  width: 120px;
}

/* Items details styling */
.items-details {
  position: relative;
}

.items-summary {
  cursor: pointer;
  color: #3b82f6;
  font-weight: 500;
  list-style: none;
  user-select: none;
  display: inline-block;
}

.items-summary::-webkit-details-marker {
  display: none;
}

.items-summary::before {
  content: '▶';
  display: inline-block;
  margin-right: 0.375rem;
  font-size: 0.75rem;
  transition: transform 0.2s;
}

.items-details[open] .items-summary::before {
  transform: rotate(90deg);
}

.items-summary:hover {
  color: #2563eb;
  text-decoration: underline;
}

/* Dropdown container */
.items-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 0.5rem;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  padding: 0.75rem;
  z-index: 10;
  min-width: 300px;
  max-width: 400px;
}

.item-entry {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border-bottom: 1px solid #f1f5f9;
}

.item-entry:last-child {
  border-bottom: none;
}

.item-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: #0f172a;
}

.item-meta {
  font-size: 0.813rem;
  color: #64748b;
}
.restock-empty {
  padding: 1.5rem;
  text-align: center;
  color: #64748b;
}

/* Restock table: auto layout with no-wrap cells so the order number and status badge stay on
   one line; .table-container scrolls horizontally if the viewport is still too narrow. */
.restock-table {
  width: 100%;
  min-width: 960px;
}

.restock-table th,
.restock-table td {
  white-space: nowrap;
  padding: 0.5rem 0.625rem;
}

.restock-table .col-order-number,
.restock-table .col-customer,
.restock-table .col-items,
.restock-table .col-status,
.restock-table .col-date,
.restock-table .col-value {
  width: auto;
}
</style>
