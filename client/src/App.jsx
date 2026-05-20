import { useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import Workspace from './components/Workspace.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));

    const onUnauth = () => setUser(null);
    window.addEventListener('nexcollab:unauthenticated', onUnauth);
    return () => window.removeEventListener('nexcollab:unauthenticated', onUnauth);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500 text-sm">
        memuat…
      </div>
    );
  }
  if (!user) return <Login onLogin={setUser} />;
  return <Workspace user={user} onLogout={() => setUser(null)} onUserUpdated={setUser} />;
}
