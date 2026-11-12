<template>
  <div class="card">
    <div class="budget-panel">
      <div class="budget-control">
        <label for="budget-slider" class="budget-label">{{ t('restocking.budget') }}</label>
        <input
          id="budget-slider"
          type="range"
          min="0"
          :max="sliderMax"
          :step="step"
          :value="budget"
          data-testid="budget-slider"
          @input="emit('update:budget', Number($event.target.value))"
        />
        <strong class="budget-value" data-testid="budget-value">{{ formatBudget(budget) }}</strong>
      </div>
      <div class="budget-stats">
        <div class="budget-stat">
          <span class="stat-caption">{{ t('restocking.selectedTotal') }}</span>
          <strong data-testid="selected-total">{{ formatMoney(selectedTotal) }}</strong>
        </div>
        <div class="budget-stat">
          <span class="stat-caption">{{ t('restocking.remainingBudget') }}</span>
          <strong data-testid="remaining-budget">{{ formatMoney(remainingBudget) }}</strong>
        </div>
        <button
          type="button"
          class="place-order"
          data-testid="place-order-button"
          :disabled="selectedCount === 0 || submitting"
          @click="emit('place-order')"
        >
          {{ submitting ? t('restocking.placingOrder') : t('restocking.placeOrder') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '../composables/useI18n'
import { formatCurrency, formatExact } from '../utils/currency'

defineProps({
  budget: { type: Number, required: true },
  sliderMax: { type: Number, required: true },
  step: { type: Number, default: 500 },
  selectedTotal: { type: Number, required: true },
  remainingBudget: { type: Number, required: true },
  selectedCount: { type: Number, required: true },
  submitting: { type: Boolean, default: false }
})

// Props down, events up: the parent owns the budget and re-runs selection when it changes.
const emit = defineEmits(['update:budget', 'place-order'])

const { t, currentCurrency } = useI18n()

const formatMoney = (amount) => formatExact(amount, currentCurrency.value)

// Whole budgets read cleaner on the slider; show cents only once deductions make it fractional.
const formatBudget = (amount) =>
  Number.isInteger(amount) ? formatCurrency(amount, currentCurrency.value) : formatMoney(amount)
</script>

<style scoped>
.budget-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
}

.budget-control {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex: 1 1 320px;
}

.budget-control input[type='range'] {
  flex: 1;
  min-width: 160px;
}

.budget-label,
.stat-caption {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.budget-value {
  min-width: 90px;
  color: #0f172a;
  font-size: 1.125rem;
}

.budget-stats {
  display: flex;
  align-items: center;
  gap: 2rem;
}

.budget-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #0f172a;
}

.place-order {
  background: #0f172a;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.625rem 1.25rem;
  font-weight: 600;
  cursor: pointer;
}

.place-order:disabled {
  background: #cbd5e1;
  cursor: not-allowed;
}
</style>
