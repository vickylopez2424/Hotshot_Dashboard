import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import './index.css';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute   from './components/Auth/ProtectedRoute';
import App              from './App';
import LandingPage      from './pages/LandingPage';
import AuthPage         from './pages/AuthPage';
import PendingApproval  from './pages/PendingApproval';

// Hotshot brand theme — fire orange (#ff6b35) as the primary color
const theme = createTheme({
  primaryColor: 'fire',
  primaryShade: { light: 5, dark: 5 },
  defaultRadius: 'sm',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  colors: {
    fire: [
      '#fff0e9', '#ffd9c8', '#ffb89e', '#ff9670', '#ff7a4d',
      '#ff6b35', '#f25c28', '#d44a1c', '#a93a16', '#7e2b10',
    ],
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <MantineProvider theme={theme} forceColorScheme="dark">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/welcome" element={<LandingPage />} />
            <Route path="/auth"    element={<AuthPage />} />
            <Route path="/pending" element={<PendingApproval />} />

            {/* Protected dashboard — requires approved account */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <App />
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>
);
