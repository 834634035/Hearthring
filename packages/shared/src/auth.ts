export const USER_ROLES = ["admin", "editor", "viewer"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理员",
  editor: "编辑者",
  viewer: "观察者"
};

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "管理员：用户、权限和内容全部可管理",
  editor: "编辑者：可管理内容，不可管理用户",
  viewer: "观察者：只读查看内容"
};

export const USER_ROLE_OPTIONS = USER_ROLES.map((value) => ({
  value,
  label: USER_ROLE_LABELS[value]
}));

export const DEFAULT_USER_ROLE: UserRole = "viewer";

export function isUserRole(value: string): value is UserRole {
  return USER_ROLES.includes(value as UserRole);
}

export function canManageUsers(role: string) {
  return role === "admin";
}

export function canWriteContent(role: string) {
  return role === "admin" || role === "editor";
}

export function canReadContent(role: string) {
  return canWriteContent(role) || role === "viewer";
}
