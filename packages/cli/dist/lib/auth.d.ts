import { Credentials } from './config.js';
export interface AuthResult {
    success: boolean;
    message: string;
    credentials?: Credentials;
}
export declare function loginWithBrowser(): Promise<AuthResult>;
export declare function loginWithCredentials(email: string, password: string): Promise<AuthResult>;
export declare function loginWithToken(token: string): Promise<AuthResult>;
export declare function logout(): void;
export declare function getCurrentUser(): Credentials | null;
export declare function requireAuth(): Credentials;
//# sourceMappingURL=auth.d.ts.map