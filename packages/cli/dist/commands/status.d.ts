import { Command } from 'commander';
export interface FileChange {
    path: string;
    status: 'modified' | 'new' | 'deleted';
}
export declare function getWorkspaceChanges(workspaceRoot: string): FileChange[];
export declare const statusCommand: Command;
//# sourceMappingURL=status.d.ts.map