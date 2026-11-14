export const rupiah = (amount) =>
  `Rp${new Intl.NumberFormat('id-ID').format(amount)},-`
