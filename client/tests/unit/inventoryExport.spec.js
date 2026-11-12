import { describe, it, expect, afterEach } from 'vitest'
import { buildInventoryCsv, inventoryCsvFilename } from '../../src/utils/inventoryExport'
import { useI18n } from '../../src/composables/useI18n'

const item = (extra = {}) => ({
  id: 1,
  sku: 'SNS-001',
  name: 'Temperature Sensor Module',
  category: 'Sensors',
  warehouse: 'London',
  quantity_on_hand: 12,
  reorder_point: 20,
  unit_cost: 4.5,
  location: 'Warehouse B-07',
  ...extra
})

const labels = () => {
  const { t, translateProductName, translateCategory, translateWarehouse } = useI18n()
  return {
    t,
    translateProductName,
    translateCategory,
    translateWarehouse,
    statusLabel: (i) => (i.quantity_on_hand <= i.reorder_point ? 'Low Stock' : 'In Stock')
  }
}

const lines = (csv) => csv.split('\r\n')

describe('buildInventoryCsv', () => {
  afterEach(() => useI18n().setLocale('en'))

  it('exports the same columns as the Stock Levels table, with money columns marked as USD', () => {
    expect(lines(buildInventoryCsv([], labels()))[0]).toBe(
      'SKU,Item Name,Category,Quantity on Hand,Reorder Point,Unit Cost (USD),Total Value (USD),Location,Status'
    )
  })

  it('writes one row per item, in the order given', () => {
    const csv = buildInventoryCsv(
      [item(), item({ id: 2, sku: 'MTR-002', name: 'Motor', quantity_on_hand: 40, unit_cost: 10 })],
      labels()
    )
    expect(lines(csv).slice(1)).toEqual([
      'SNS-001,Temperature Sensor Module,Sensors,12,20,4.50,54.00,Warehouse B-07,Low Stock',
      'MTR-002,Motor,Sensors,40,20,10.00,400.00,Warehouse B-07,In Stock'
    ])
  })

  it('computes total value from quantity and unit cost, rounded to cents', () => {
    // 3 * 0.1 is 0.30000000000000004 in floating point; the file must say 0.30.
    const csv = buildInventoryCsv([item({ quantity_on_hand: 3, unit_cost: 0.1 })], labels())
    expect(lines(csv)[1].split(',')[6]).toBe('0.30')
  })

  it('translates headers and labels into Japanese but keeps money in USD', () => {
    // Japanese switches the UI to yen. The file keeps the API's USD figures so it can be
    // reconciled against other exports; the (USD) header says which currency it is.
    useI18n().setLocale('ja')
    const { t, translateProductName, translateCategory, translateWarehouse } = useI18n()
    const [header, row] = lines(buildInventoryCsv([item()], labels())).map((l) => l.split(','))

    expect(header[0]).toBe(t('inventory.table.sku'))
    expect(header[5]).toBe(`${t('inventory.table.unitCost')} (USD)`)
    expect(row[1]).toBe(translateProductName('Temperature Sensor Module'))
    expect(row[1]).not.toBe('Temperature Sensor Module')
    expect(row[2]).toBe(translateCategory('Sensors'))
    expect(row[7]).toBe(translateWarehouse('Warehouse B-07'))
    expect(row[5]).toBe('4.50')
    expect(row[6]).toBe('54.00')
  })
})

describe('inventoryCsvFilename', () => {
  it('names the file after the local date, zero-padded', () => {
    expect(inventoryCsvFilename(new Date(2026, 0, 5))).toBe('inventory-2026-01-05.csv')
  })
})
