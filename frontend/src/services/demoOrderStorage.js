const ORDER_STORAGE_KEY = 'tewiwi-orders'
const LAST_ORDER_CODE_KEY = 'tewiwi-last-order-code'
const LAST_ORDER_DISMISSED_KEY = 'tewiwi-last-order-dismissed'

export function readOrders() {
  const savedOrders = window.localStorage.getItem(ORDER_STORAGE_KEY)
  if (!savedOrders) return []
  const parsedOrders = JSON.parse(savedOrders)
  return Array.isArray(parsedOrders) ? parsedOrders : []
}

export function writeOrders(orders) {
  window.localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(orders))
}

export function readLastOrderCode() {
  return window.localStorage.getItem(LAST_ORDER_CODE_KEY) ?? null
}

export function writeLastOrderCode(code) {
  window.localStorage.setItem(LAST_ORDER_CODE_KEY, code)
  // Reset dismiss flag whenever a new order code is stored
  window.localStorage.removeItem(LAST_ORDER_DISMISSED_KEY)
}

export function isLastOrderDismissed() {
  return window.localStorage.getItem(LAST_ORDER_DISMISSED_KEY) === 'true'
}

export function dismissLastOrder() {
  window.localStorage.setItem(LAST_ORDER_DISMISSED_KEY, 'true')
}
