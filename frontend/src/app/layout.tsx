import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Starforge',
  description: 'Starforge is an experimental space simulation and level creation system where science, design, and mild existential dread collide.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/images/logo.png" type="image/png" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  )
}