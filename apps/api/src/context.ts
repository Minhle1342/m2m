import type { Request } from 'express';
import { LOCAL_USER_ID, LOCAL_WORKSPACE_ID } from '@m2m/shared';

export interface AuthContext { userId: string; workspaceId: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'; }
export type M2MRequest = Request<Record<string, string>>;

export const developmentAuth: AuthContext = { userId: LOCAL_USER_ID, workspaceId: LOCAL_WORKSPACE_ID, role: 'OWNER' };
