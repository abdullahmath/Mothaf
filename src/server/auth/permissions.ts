import type { User } from '../db/schema';

/**
 * Role-based authorization.
 *
 * The matrix below is the single source of truth. The admin UI reads it to
 * decide what to show, and the domain layer reads it to decide what to allow —
 * but those are independent checks. Hiding a button is a courtesy; the server
 * refusing the action is the control.
 *
 * A role is only introduced here when a real requirement needs it.
 */

export const PERMISSIONS = [
  'content:read',
  'content:write',
  'content:publish',
  'media:read',
  'media:write',
  'media:delete',
  'event:read',
  'event:write',
  'event:publish',
  'translation:write',
  'analytics:read',
  'user:read',
  'user:write',
  'settings:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = User['role'];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Full control, including other administrators and platform settings. */
  super_admin: PERMISSIONS,

  /** Runs the platform day to day; cannot change platform settings. */
  administrator: [
    'content:read',
    'content:write',
    'content:publish',
    'media:read',
    'media:write',
    'media:delete',
    'event:read',
    'event:write',
    'event:publish',
    'translation:write',
    'analytics:read',
    'user:read',
    'user:write',
  ],

  /** Writes and translates content, but publishing is someone else's call. */
  content_editor: [
    'content:read',
    'content:write',
    'media:read',
    'media:write',
    'event:read',
    'translation:write',
  ],

  /** Owns events end to end, and reads the content they attach to. */
  event_manager: [
    'content:read',
    'media:read',
    'media:write',
    'event:read',
    'event:write',
    'event:publish',
    'translation:write',
  ],

  /** Reads figures. Cannot change anything. */
  analyst: ['content:read', 'event:read', 'analytics:read'],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Only a super admin may create, modify or delete another super admin.
 *
 * Without this an `administrator` could escalate by promoting themselves, or
 * lock out the owner by editing the super admin account.
 */
export function canManageUserWithRole(actorRole: Role, targetRole: Role): boolean {
  if (!hasPermission(actorRole, 'user:write')) return false;
  if (targetRole === 'super_admin') return actorRole === 'super_admin';
  return true;
}
