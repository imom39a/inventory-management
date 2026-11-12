<template>
  <div class="restocking">
    <div class="page-header">
      <h2>{{ t('restocking.title') }}</h2>
      <p>{{ t('restocking.description') }}</p>
    </div>

    <div v-if="loading" class="loading">{{ t('common.loading') }}</div>
    <div v-else-if="loadError && budget === null" class="error">{{ loadError }}</div>
    <div v-else>
      <div v-if="loadError" class="banner banner-error" data-testid="restock-load-error">
        {{ loadError }}
      </div>
      <div v-if="successOrders.length" class="banner banner-success" data-testid="restock-success">
        <span>{{ t('restocking.success', { orders: successOrders.join(', ') }) }}</span>
        <router-link to="/orders" class="banner-link">{{ t('restocking.viewOrders') }}</router-link>
      </div>
      <div v-if="submitError" class="banner banner-error" data-testid="restock-error">
        {{ submitError }}
      </div>

      <RestockBudgetPanel
        :budget="budget"
        :slider-max="sliderMax"
        :selected-total="selectedTotal"
        :remaining-budget="remainingBudget"
        :selected-count="selectedSkus.length"
        :submitting="submitting"
        @update:budget="onBudgetChange"
        @place-order="placeOrder"
      />

      <div v-if="candidates.length === 0" class="card empty" data-testid="restock-empty">
        {{ t('restocking.empty') }}
      </div>
      <div v-else class="card">
        <div class="table-container">
          <table class="restock-table">
            <thead>
              <tr>
                <th class="col-check">{{ t('restocking.table.select') }}</th>
                <th>{{ t('restocking.table.sku') }}</th>
                <th>{{ t('restocking.table.name') }}</th>
                <th>{{ t('restocking.table.warehouse') }}</th>
                <th>{{ t('restocking.table.category') }}</th>
                <th class="num">{{ t('restocking.table.onHand') }}</th>
                <th class="num">{{ t('restocking.table.reorderPoint') }}</th>
                <th class="num">{{ t('restocking.table.orderQty') }}</th>
                <th class="num">{{ t('restocking.table.unitCost') }}</th>
                <th class="num">{{ t('restocking.table.lineTotal') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="c in candidates"
                :key="c.sku"
                :class="{ selected: selectedSet.has(c.sku) }"
                :data-testid="`candidate-row-${c.sku}`"
              >
                <td class="col-check">
                  <input
                    type="checkbox"
                    :aria-label="t('restocking.selectLine', { sku: c.sku })"
                    :checked="selectedSet.has(c.sku)"
                    :disabled="isDisabled(c)"
                    :data-testid="`candidate-checkbox-${c.sku}`"
                    @change="toggle(c.sku, $event.target.checked)"
                  />
                </td>
                <td><strong>{{ c.sku }}</strong></td>
                <td>{{ translateProductName(c.name) }}</td>
                <td>{{ translateWarehouse(c.warehouse) }}</td>
                <td>{{ translateCategory(c.category) }}</td>
                <td class="num">{{ c.quantity_on_hand }}</td>
                <td class="num">{{ c.reorder_point }}</td>
                <td class="num">{{ c.quantity }}</td>
                <td class="num">{{ formatMoney(c.unit_cost) }}</td>
                <td class="num"><strong>{{ formatMoney(c.line_total) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '../api'
import { useFilters } from '../composables/useFilters'
import { useI18n } from '../composables/useI18n'
import { formatExact } from '../utils/currency'
import RestockBudgetPanel from '../components/RestockBudgetPanel.vue'

const BUDGET_STEP = 500

// Money is compared in integer cents: summing dollar floats (1000.1 + 2000.2) drifts by
// fractions of a cent and would wrongly reject a line that fits exactly.
const toCents = (amount) => Math.round(amount * 100)

export default {
  name: 'Restocking',
  components: { RestockBudgetPanel },
  setup() {
    const { t, currentCurrency, translateProductName, translateWarehouse, translateCategory } = useI18n()
    const { selectedLocation, selectedCategory } = useFilters()

    const loading = ref(true)
    const loadError = ref(null)
    const candidates = ref([])
    const maxBudget = ref(0)
    // null until the first load so we know to adopt the server's default instead of clamping.
    const budget = ref(null)
    const selectedSkus = ref([])
    const submitting = ref(false)
    const submitError = ref(null)
    const successOrders = ref([])

    // Guards against a slow earlier response overwriting a newer one after rapid filter changes.
    let requestId = 0

    const selectedSet = computed(() => new Set(selectedSkus.value))

    // The server's max_budget is rarely a multiple of the step; rounding up keeps the top of the
    // slider reachable so the user can always select every candidate.
    const sliderMax = computed(() => Math.ceil(maxBudget.value / BUDGET_STEP) * BUDGET_STEP)

    const selectedTotalCents = computed(() =>
      candidates.value
        .filter((c) => selectedSet.value.has(c.sku))
        .reduce((sum, c) => sum + toCents(c.line_total), 0)
    )
    const remainingCents = computed(() => toCents(budget.value ?? 0) - selectedTotalCents.value)

    const selectedTotal = computed(() => selectedTotalCents.value / 100)
    const remainingBudget = computed(() => remainingCents.value / 100)

    const formatMoney = (amount) => formatExact(amount, currentCurrency.value)

    // Mirrors the server's greedy rule so dragging the slider doesn't need a request per tick.
    // Candidates arrive most urgent first; a line that doesn't fit is skipped (not split) and
    // later, cheaper lines can still use the leftover budget.
    const selectRecommended = () => {
      let remaining = toCents(budget.value ?? 0)
      const picked = []
      for (const c of candidates.value) {
        const cost = toCents(c.line_total)
        if (cost <= remaining) {
          picked.push(c.sku)
          remaining -= cost
        }
      }
      selectedSkus.value = picked
    }

    const isDisabled = (c) => !selectedSet.value.has(c.sku) && toCents(c.line_total) > remainingCents.value

    const toggle = (sku, isChecked) => {
      if (isChecked) {
        const line = candidates.value.find((c) => c.sku === sku)
        // Re-check the fit here too: the disabled attribute alone can be bypassed.
        if (!line || selectedSet.value.has(sku) || toCents(line.line_total) > remainingCents.value) return
        selectedSkus.value = [...selectedSkus.value, sku]
      } else {
        selectedSkus.value = selectedSkus.value.filter((s) => s !== sku)
      }
    }

    const onBudgetChange = (value) => {
      budget.value = value
      selectRecommended()
    }

    const loadData = async () => {
      const myRequest = ++requestId
      // Only the first load swaps the page for a spinner; later reloads keep the slider mounted
      // so it isn't reset under the user's pointer.
      if (budget.value === null) loading.value = true
      try {
        // No budget param: the response's max_budget is needed to size the slider.
        const data = await api.getRestockRecommendations({
          warehouse: selectedLocation.value,
          category: selectedCategory.value
        })
        if (myRequest !== requestId) return
        candidates.value = data.candidates
        maxBudget.value = data.max_budget
        // First load adopts the server's default budget; later loads keep the user's budget if it
        // still fits the new maximum.
        budget.value =
          budget.value === null ? data.budget : Math.min(budget.value, sliderMax.value)
        selectRecommended()
        loadError.value = null
      } catch (err) {
        if (myRequest !== requestId) return
        // Shown as a banner when data is already on screen, so a failed refresh after ordering
        // doesn't hide the confirmation.
        loadError.value = t('restocking.loadError')
        console.error(err)
      } finally {
        if (myRequest === requestId) loading.value = false
      }
    }

    const placeOrder = async () => {
      if (selectedSkus.value.length === 0 || submitting.value) return
      submitting.value = true
      submitError.value = null
      successOrders.value = []
      try {
        const created = await api.createRestockOrder(budget.value, [...selectedSkus.value])
        successOrders.value = created.map((o) => o.order_number)
        // The placed spend is committed, so what's left to plan with is the remainder.
        const spentCents = created.reduce((sum, o) => sum + toCents(o.total_cost), 0)
        budget.value = Math.max(0, toCents(budget.value) - spentCents) / 100
        await loadData()
      } catch (err) {
        const detail = err.response?.data?.detail
        // FastAPI 422s return an array of validation objects, which isn't displayable.
        submitError.value = typeof detail === 'string' && detail ? detail : t('restocking.orderError')
      } finally {
        submitting.value = false
      }
    }

    // Period and status filters don't apply to restocking, so only these two trigger a reload.
    watch([selectedLocation, selectedCategory], () => {
      successOrders.value = []
      submitError.value = null
      loadData()
    })

    onMounted(loadData)

    return {
      t,
      loading,
      loadError,
      candidates,
      sliderMax,
      budget,
      selectedSkus,
      selectedSet,
      selectedTotal,
      remainingBudget,
      submitting,
      submitError,
      successOrders,
      formatMoney,
      translateCategory,
      isDisabled,
      toggle,
      onBudgetChange,
      placeOrder,
      translateProductName,
      translateWarehouse
    }
  }
}
</script>

<style scoped>
.banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1.25rem;
  font-size: 0.875rem;
  border: 1px solid;
}

.banner-success {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.banner-error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #991b1b;
}

.banner-link {
  color: #2563eb;
  font-weight: 600;
}

.restock-table .num {
  text-align: right;
}

.col-check {
  width: 60px;
}

tr.selected {
  background: #f8fafc;
}

.empty {
  text-align: center;
  color: #64748b;
  padding: 2rem;
}
</style>
