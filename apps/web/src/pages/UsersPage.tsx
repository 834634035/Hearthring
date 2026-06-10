import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  apiCreateUser,
  apiDeleteUser,
  apiListUsers,
  apiResetUserPassword,
  apiUpdateUser,
  type AuthUser
} from "../api";
import { DEFAULT_USER_ROLE, USER_ROLE_OPTIONS, canManageUsers, isUserRole, type UserRole } from "@tribal-epic/shared";
import { useAuth } from "../auth";

const roles = USER_ROLE_OPTIONS;

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [newUser, setNewUser] = useState<{ username: string; displayName: string; password: string; role: UserRole }>({
    username: "",
    displayName: "",
    password: "",
    role: DEFAULT_USER_ROLE
  });
  const [resetPasswords, setResetPasswords] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const canManage = currentUser ? canManageUsers(currentUser.role) : false;

  const loadUsers = useCallback(async () => {
    if (!canManage) return;
    setError("");
    try {
      setUsers(await apiListUsers());
    } catch {
      setError("加载用户失败");
    }
  }, [canManage]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const adminCount = useMemo(() => users.filter((user) => user.role === "admin").length, [users]);

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newUser.password.length < 8) {
      setError("初始密码至少需要 8 个字符");
      return;
    }
    setLoading(true);
    try {
      await apiCreateUser(newUser);
      setNewUser({ username: "", displayName: "", password: "", role: DEFAULT_USER_ROLE });
      setMessage("用户已创建");
      await loadUsers();
    } catch {
      setError("创建用户失败，请检查账号是否已存在");
    } finally {
      setLoading(false);
    }
  }

  async function updateRole(user: AuthUser, role: string) {
    setError("");
    setMessage("");
    if (user.id === currentUser?.id && user.role === "admin" && role !== "admin" && adminCount <= 1) {
      setError("不能移除最后一个管理员");
      return;
    }
    await apiUpdateUser(user.id, { role });
    setMessage("权限已更新");
    await loadUsers();
  }

  async function resetPassword(user: AuthUser) {
    const nextPassword = resetPasswords[user.id] ?? "";
    setError("");
    setMessage("");
    if (nextPassword.length < 8) {
      setError("重置密码至少需要 8 个字符");
      return;
    }
    await apiResetUserPassword(user.id, nextPassword);
    setResetPasswords((prev) => ({ ...prev, [user.id]: "" }));
    setMessage(`已重置 ${user.username} 的密码`);
  }

  async function removeUser(user: AuthUser) {
    setError("");
    setMessage("");
    if (user.id === currentUser?.id) {
      setError("不能删除当前登录用户");
      return;
    }
    if (user.role === "admin" && adminCount <= 1) {
      setError("不能删除最后一个管理员");
      return;
    }
    if (!window.confirm(`确认删除用户「${user.username}」吗？`)) return;
    await apiDeleteUser(user.id);
    setMessage("用户已删除");
    await loadUsers();
  }

  if (!canManage) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <p className="eyebrow">Access Control</p>
            <h1>权限管理</h1>
          </div>
        </section>
        <div className="error-line">只有管理员可以管理用户和权限。</div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <p className="eyebrow">Access Control</p>
          <h1>权限管理</h1>
        </div>
        <button className="secondary-button" onClick={loadUsers}>
          刷新
        </button>
      </section>

      {error ? <div className="error-line">{error}</div> : null}
      {message ? <div className="success-line">{message}</div> : null}

      <form className="editor-panel account-form" onSubmit={createUser}>
        <div className="panel-title">
          <h2>创建用户</h2>
          <span>默认建议给观察者权限</span>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>账号</span>
            <input value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} />
          </label>
          <label className="field">
            <span>显示名</span>
            <input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} />
          </label>
          <label className="field">
            <span>初始密码</span>
            <input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} />
          </label>
          <label className="field">
            <span>角色</span>
            <select
              value={newUser.role}
              onChange={(event) => {
                const role = event.target.value;
                if (isUserRole(role)) setNewUser({ ...newUser, role });
              }}
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button className="primary-button" type="submit" disabled={loading}>
            创建
          </button>
        </div>
      </form>

      <section className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>账号</th>
                <th>显示名</th>
                <th>角色</th>
                <th>重置密码</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.displayName}</td>
                  <td>
                    <select value={user.role} onChange={(event) => void updateRole(user, event.target.value)}>
                      {roles.map((role) => (
                        <option key={role.value} value={role.value}>
                          {role.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="inline-password-reset">
                      <input
                        type="password"
                        placeholder="至少 8 位"
                        value={resetPasswords[user.id] ?? ""}
                        onChange={(event) => setResetPasswords((prev) => ({ ...prev, [user.id]: event.target.value }))}
                      />
                      <button className="secondary-button" onClick={() => void resetPassword(user)} type="button">
                        重置
                      </button>
                    </div>
                  </td>
                  <td>
                    <button className="icon-button danger" title="删除" onClick={() => void removeUser(user)}>
                      删
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && <div className="empty-state">暂无用户</div>}
        </div>
      </section>
    </div>
  );
}
