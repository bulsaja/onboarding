export type Role = 'admin' | 'operator' | 'reviewer' | 'viewer';

export type Permission =
  | 'manage_templates'
  | 'approve_content'
  | 'schedule_publish'
  | 'rotate_secrets'
  | 'view_reports'
  | 'manage_rbac';

const rolePermissions: Record<Role, Set<Permission>> = {
  admin: new Set([
    'manage_templates',
    'approve_content',
    'schedule_publish',
    'rotate_secrets',
    'view_reports',
    'manage_rbac'
  ]),
  operator: new Set(['manage_templates', 'schedule_publish', 'rotate_secrets', 'view_reports']),
  reviewer: new Set(['approve_content', 'view_reports']),
  viewer: new Set(['view_reports'])
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return rolePermissions[role].has(permission);
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
}

export class RbacAuthorizer {
  authorize(role: Role, permission: Permission): AuthorizationDecision {
    const allowed = hasPermission(role, permission);
    return {
      allowed,
      reason: allowed
        ? `role ${role} has ${permission}`
        : `role ${role} is missing required permission ${permission}`
    };
  }
}
