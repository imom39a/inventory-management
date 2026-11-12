import { describe, it, expect, vi, afterEach } from 'vitest'
import { toCsv, downloadCsv } from '../../src/utils/csv'

const columns = [
  { header: 'Name', value: (row) => row.name },
  { header: 'Qty', value: (row) => row.qty }
]

describe('toCsv', () => {
  it('writes a header row then one row per record, separated by CRLF', () => {
    const csv = toCsv(columns, [
      { name: 'Bolt', qty: 3 },
      { name: 'Nut', qty: 10 }
    ])
    expect(csv).toBe('Name,Qty\r\nBolt,3\r\nNut,10')
  })

  it('writes only the header when there are no rows', () => {
    expect(toCsv(columns, [])).toBe('Name,Qty')
  })

  it('quotes fields containing commas, quotes or line breaks and doubles embedded quotes', () => {
    const csv = toCsv(columns, [
      { name: 'Sensor, 5V', qty: 1 },
      { name: 'The "Big" One', qty: 2 },
      { name: 'Line\nBreak', qty: 3 }
    ])
    expect(csv.split('\r\n').slice(1)).toEqual(['"Sensor, 5V",1', '"The ""Big"" One",2', '"Line\nBreak",3'])
  })

  it('writes null and undefined as empty fields', () => {
    expect(toCsv(columns, [{ name: null, qty: undefined }])).toBe('Name,Qty\r\n,')
  })

  it('neutralises text that a spreadsheet would run as a formula', () => {
    const csv = toCsv(columns, [
      { name: '=HYPERLINK("x")', qty: 1 },
      { name: '+1', qty: 2 },
      { name: '@cmd', qty: 3 }
    ])
    expect(csv.split('\r\n').slice(1)).toEqual(['"\'=HYPERLINK(""x"")",1', "'+1,2", "'@cmd,3"])
  })

  it('leaves negative numbers alone: only text is treated as a possible formula', () => {
    expect(toCsv(columns, [{ name: 'Refund', qty: -5 }])).toBe('Name,Qty\r\nRefund,-5')
  })
})

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('downloads the CSV as a UTF-8 file with a BOM, under the given filename', async () => {
    let blob
    URL.createObjectURL = vi.fn((b) => {
      blob = b
      return 'blob:csv'
    })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      expect(this.download).toBe('inventory.csv')
      expect(this.href).toBe('blob:csv')
    })

    downloadCsv('inventory.csv', 'Name\r\nナット')

    expect(click).toHaveBeenCalledTimes(1)
    expect(blob.type).toBe('text/csv;charset=utf-8')
    // jsdom's Blob has no arrayBuffer(); FileReader is the API it does implement.
    const bytes = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(new Uint8Array(reader.result))
      reader.readAsArrayBuffer(blob)
    })
    // EF BB BF is the UTF-8 BOM: without it Excel opens the file as ANSI and garbles Japanese names.
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(bytes.slice(3))).toBe('Name\r\nナット')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:csv')
    expect(document.querySelector('a[download]')).toBeNull()
  })
})
