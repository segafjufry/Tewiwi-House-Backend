import { createTheme } from '@mui/material'

export const PAYMENT_INFO = {
  bank: 'BCA',
  accountNumber: '',
  accountName: 'Tewiwi House',
  adminWhatsApp: '',
}

export const theme = createTheme({
  palette: {
    primary: { main: '#092f9e' },
    success: { main: '#82e66b' },
    background: { default: '#faedf3', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Trebuchet MS", Arial, sans-serif',
    button: { fontWeight: 700, textTransform: 'none' },
  },
  shape: { borderRadius: 18 },
})
