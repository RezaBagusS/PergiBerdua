'use client';

import { useState, useEffect } from 'react';
import AdminLogin from '../../components/admin/AdminLogin';
import AdminDashboard from '../../components/admin/AdminDashboard';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/stats');
        setAuthenticated(res.ok);
      } catch {
        setAuthenticated(false);
      }
    }
    void checkAuth();
  }, []);

  if (authenticated === null) {
    return <div className="loading">Memeriksa hak akses admin…</div>;
  }

  if (!authenticated) {
    return <AdminLogin onSuccess={() => setAuthenticated(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthenticated(false)} />;
}
