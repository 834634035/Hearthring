import { useState, type FormEvent } from "react";
import { USER_ROLE_DESCRIPTIONS, type UserRole } from "@tribal-epic/shared";
import { useNavigate } from "react-router-dom";
import { apiChangePassword } from "../api";
import { useAuth } from "../auth";

export function AccountPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (nextPassword.length < 8) {
      setError("新密码至少需要 8 个字符");
      return;
    }
    if (nextPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }

    setSaving(true);
    try {
      await apiChangePassword(currentPassword, nextPassword);
      setMessage("密码已更新，请重新登录");
      await logout();
      navigate("/login", { replace: true });
    } catch {
      setError("当前密码不正确，或新密码不符合要求");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Account Security</p>
          <h1>账号安全</h1>
        </div>
        <div className="status-pill">{user?.role}</div>
      </section>

      <section className="editor-panel account-panel">
        <div className="panel-title">
          <h2>当前守火人</h2>
          <span>{user?.username}</span>
        </div>
        <div className="account-summary">
          <strong>{user?.displayName}</strong>
          <span>{roleLabel(user?.role ?? "")}</span>
        </div>
      </section>

      <form className="editor-panel account-form" onSubmit={submit}>
        <div className="panel-title">
          <h2>修改密码</h2>
          <span>修改后所有会话都会失效</span>
        </div>
        {error ? <div className="error-line">{error}</div> : null}
        {message ? <div className="success-line">{message}</div> : null}
        <div className="form-grid">
          <label className="field">
            <span>当前密码</span>
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label className="field">
            <span>新密码</span>
            <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
          </label>
          <label className="field">
            <span>确认新密码</span>
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
        </div>
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "保存中..." : "更新密码"}
          </button>
        </div>
      </form>
    </div>
  );
}

function roleLabel(role: string) {
  if (role in USER_ROLE_DESCRIPTIONS) {
    return USER_ROLE_DESCRIPTIONS[role as UserRole];
  }
  return USER_ROLE_DESCRIPTIONS.viewer;
}
