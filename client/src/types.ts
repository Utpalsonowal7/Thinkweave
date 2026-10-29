export interface User {
  id: string;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
}
export interface Workspace {
  id: string;
  name: string;
  slug: string;
}
export interface Membership {
  role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER';
  workspace: Workspace;
}
export interface BoardInfo {
  id: string;
  title: string;
  workspaceId: string;
  epoch: number;
}
export interface BoardAccess {
  board: BoardInfo;
  role: Membership['role'];
}
