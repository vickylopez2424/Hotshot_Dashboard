import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import { AuthProvider } from './context/AuthContext';
import ProtectedRoute   from './components/Auth/ProtectedRoute';
import App              from './App';
import LandingPage      from './pages/LandingPage';
import AuthPage         from './pages/AuthPage';
import PendingApproval  from './pages/PendingApproval';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
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
  </React.StrictMode>
);
