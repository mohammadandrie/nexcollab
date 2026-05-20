import { useEffect, useState } from 'react';
import { api, ROLE_LABEL } from '../api.js';

export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/auth/users')
      .then(({ users }) => setUsers(users))
      .catch((e) => setErr(String(e)));
  }, []);

  async function login(username) {
    setErr('');
    try {
      const { user } = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });
      onLogin(user);
    } catch (e) {
      setErr('Login gagal: ' + e.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 justify-center">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600
                          flex items-center justify-center text-white font-bold">N</div>
          <div>
            <div className="font-semibold">Nexcollab</div>
            <div className="text-[11px] text-neutral-500 -mt-0.5">enowX team workspace</div>
          </div>
        </div>

        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-5">
          <div className="text-sm text-neutral-300 mb-3">Pilih siapa kamu:</div>
          <div className="grid grid-cols-1 gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => login(u.username)}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-neutral-950
                           border border-neutral-800 hover:border-neutral-700 text-left">
                <div className="w-9 h-9 rounded-full flex items-center justify-center
                                text-sm font-bold"
                  style={{ background: u.color + '22', color: u.color, border: `1px solid ${u.color}55` }}>
                  {u.avatar_letter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{u.name}</div>
                  <div className="text-[11px] text-neutral-500">{ROLE_LABEL[u.role] || u.role}</div>
                </div>
                <span className="text-neutral-600 text-xs">→</span>
              </button>
            ))}
          </div>
          {err && <div className="text-xs text-red-400 mt-3">{err}</div>}
        </div>
        <p className="text-[11px] text-neutral-600 text-center mt-4">
          Internal team — no password.
        </p>
      </div>
    </div>
  );
}
