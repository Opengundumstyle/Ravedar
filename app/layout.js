import './globals.css';
import {
  Rubik_Wet_Paint,
  Audiowide,
  Chakra_Petch,
  Space_Grotesk,
  Permanent_Marker,
} from 'next/font/google';
import { AuthProvider } from './components/AuthContext';
import MobileBootstrap from './components/MobileBootstrap';
import PushNotificationBootstrap from './components/PushNotificationBootstrap';

const graffiti = Rubik_Wet_Paint({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-graffiti',
  display: 'swap',
});
const neon = Audiowide({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-neon',
  display: 'swap',
});
const monoAccent = Chakra_Petch({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-mono-accent',
  display: 'swap',
});
const bodyMono = Space_Grotesk({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-body-mono',
  display: 'swap',
});
const marker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-marker',
  display: 'swap',
});

export const metadata = {
  title: 'Ravedar - Find Your Rave Match',
  description:
    'Connect with fellow ravers and find your perfect match for the next festival or rave.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Rave Match',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  const fontVars = `${graffiti.variable} ${neon.variable} ${monoAccent.variable} ${bodyMono.variable} ${marker.variable}`;
  return (
    <html lang="en" className={fontVars}>
      <body>
        <MobileBootstrap />
        <PushNotificationBootstrap />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
