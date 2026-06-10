import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { LoginHearthBackground } from "../components/LoginHearthBackground";

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("graybud");
  const [password, setPassword] = useState("hearthring");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <main className="login-page">
      <LoginHearthBackground />
      <div className="login-shade" />
      <section className="login-panel" aria-label="登录">
        <p className="eyebrow">Hearthring Admin</p>
        <h1>火环</h1>
        <p className="login-copy">围火而立，记录部落、图腾、盟誓与即将越海而来的阴影。</p>

        <form
          className="login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setSubmitting(true);
            try {
              await login(username, password);
              navigate("/");
            } catch {
              setError("账号或火塘口令不正确");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <label className="field">
            <span>账号</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="field">
            <span>火塘口令</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="login-error">{error}</div> : null}
          <button className="primary-button login-submit" type="submit" disabled={submitting}>
            {submitting ? "辨认中..." : "入火"}
          </button>
        </form>
      </section>
    </main>
  );
}
