import './globals.css';
import { AuthProvider } from './components/AuthContext';

export const metadata = {
  title: 'Ravedar - Find Your Rave Match',
  description: 'Connect with fellow ravers and find your perfect match for the next festival or rave.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
} 