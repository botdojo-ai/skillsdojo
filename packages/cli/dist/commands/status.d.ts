import { Command } from 'commander';
export interface FileChange {
    path: string;
    status: 'new' | 'modified' | 'deleted';
}
/**
 * Get the skills directory for a workspace
 * Prefers .agents/skills/ if it exists, otherwise uses root
 */
export declare function getSkillsDir(workspaceRoot: string): string;
/**
 * Get list of changes in the workspace compared to the index
 */
export declare function getWorkspaceChanges(workspaceRoot: string): FileChange[];
export declare const statusCommand: Command;
//# sourceMappingURL=status.d.ts.map