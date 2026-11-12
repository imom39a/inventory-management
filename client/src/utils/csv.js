// CSV per RFC 4180: CRLF line endings, fields quoted only when they contain a comma, quote or
// line break, embedded quotes doubled.

// Spreadsheets run a cell starting with one of these as a formula, so a product name like
// "=HYPERLINK(...)" would execute when the file is opened. Only text is checked: a negative
// number is data, not a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/

const escapeField = (value) => {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// columns: [{ header, value: (row) => cellValue }]
export function toCsv(columns, rows) {
  const lines = [columns.map((column) => escapeField(column.header))]
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(column.value(row))))
  }
  return lines.map((fields) => fields.join(',')).join('\r\n')
}

export function downloadCsv(filename, csv) {
  // The BOM tells Excel the file is UTF-8; without it Japanese product names open garbled.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
