/** Hitung slot pengiriman demo berdasarkan pesanan yang tersedia di browser.
 * Untuk pemakaian nyata, perhitungan kapasitas harus dilakukan ulang di backend/database.
 */
export function getDeliveryOptions(orders) {
  const reservedCapacity = [50, 30, 0]

  return [2, 6, 9].map((daysFromToday, index) => {
    const date = new Date()
    date.setDate(date.getDate() + daysFromToday)
    const id = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    const orderedQuantity = orders
      .filter((order) => order.delivery?.id === id && order.status !== 'Dibatalkan')
      .reduce(
        (total, order) =>
          total + (order.items ?? []).reduce((itemTotal, item) => itemTotal + item.quantity, 0),
        0,
      )
    const capacity = 50
    const used = Math.min(capacity, reservedCapacity[index] + orderedQuantity)

    return {
      id,
      weekday: new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(date),
      date: new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date),
      available: capacity - used,
      capacity,
      used,
    }
  })
}
