interface AddSkillOptions {
    global?: boolean;
    agents?: string[];
    list?: boolean;
    yes?: boolean;
}
/**
 * Download and extract a skill from SkillsDojo
 */
export declare function addSkillFromDojo(accountSlug: string, collectionSlug: string, skillPath: string, options: AddSkillOptions): Promise<void>;
export {};
//# sourceMappingURL=add-skill.d.ts.map