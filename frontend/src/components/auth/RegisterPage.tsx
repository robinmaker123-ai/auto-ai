import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Bot } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";

export function RegisterPage() {
  const { register, user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(name, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to register");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4 dark:bg-neutral-950">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-soft dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500 text-white">
            <Bot size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-950 dark:text-white">Auto-AI</h1>
            <p className="text-sm text-slate-500 dark:text-neutral-400">Create your workspace</p>
          </div>
        </div>
        {error && <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
        </label>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="mb-5 block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        </label>
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating..." : "Register"}
        </button>
        <p className="mt-4 text-center text-sm text-slate-600 dark:text-neutral-400">
          Already registered? <Link className="font-medium text-emerald-600 dark:text-emerald-400" to="/login">Log in</Link>
        </p>
      </form>
    </div>
  );
}

