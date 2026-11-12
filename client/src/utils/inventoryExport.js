import { toCsv } from './csv'

// Money stays in USD even when the UI shows yen: the file carries the API's figures so it
// can be reconciled with other systems, and the header names the currency. Amounts are
// fixed to cents so floating-point noise (3 * 0.1) never reaches the file.
const usd = (amount) => amount.toFixed(2)

// labels: the translation helpers from useI18n plus statusLabel(item), so the file uses
// the same wording as the Stock Levels table in the current language.
export function buildInventoryCsv(items, labels) {
  const { t, translateProductName, translateCategory, translateWarehouse, statusLabel } = labels
  const columns = [
    { header: t('inventory.table.sku'), value: (item) => item.sku },
    { header: t('inventory.table.itemName'), value: (item) => translateProductName(item.name) },
    { header: t('inventory.table.category'), value: (item) => translateCategory(item.category) },
    { header: t('inventory.table.quantityOnHand'), value: (item) => item.quantity_on_hand },
    { header: t('inventory.table.reorderPoint'), value: (item) => item.reorder_point },
    { header: `${t('inventory.table.unitCost')} (USD)`, value: (item) => usd(item.unit_cost) },
    {
      header: `${t('inventory.table.totalValue')} (USD)`,
      value: (item) => usd(item.quantity_on_hand * item.unit_cost)
    },
    { header: t('inventory.table.location'), value: (item) => translateWarehouse(item.location) },
    { header: t('inventory.table.status'), value: statusLabel }
  ]
  return toCsv(columns, items)
}

export function inventoryCsvFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `inventory-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.csv`
}
