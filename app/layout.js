import './globals.css'

export const metadata = {
  title: 'Ravedar - Find Your Rave Match',
  description: 'Connect with fellow ravers who share your vibe at events around the world',
  keywords: 'rave, edm, festival, matching, dating, music, events',
  authors: [{ name: 'Ravedar Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'index, follow',
  openGraph: {
    title: 'Ravedar - Find Your Rave Match',
    description: 'Connect with fellow ravers who share your vibe at events around the world',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ravedar - Find Your Rave Match',
    description: 'Connect with fellow ravers who share your vibe at events around the world',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
} 