import { randomBytes } from 'crypto';
import open from 'open';
import chalk from 'chalk';
import ora from 'ora';
import { api } from './api.js';
import { saveCredentials, clearCredentials, getCredentials } from './config.js';
export async function loginWithBrowser() {
    const state = randomBytes(16).toString('hex');
    const spinner = ora('Initiating authentication...').start();
    // Initiate CLI auth flow
    const initResponse = await api.initiateCliAuth(state);
    if (initResponse.error || !initResponse.data) {
        spinner.fail('Failed to initiate authentication');
        return {
            success: false,
            message: initResponse.error?.message || 'Failed to initiate authentication',
        };
    }
    // Open browser
    spinner.text = 'Opening browser for authentication...';
    try {
        await open(initResponse.data.authUrl);
    }
    catch {
        spinner.warn('Could not open browser automatically');
        console.log(chalk.yellow('\nPlease open this URL in your browser:'));
        console.log(chalk.cyan(initResponse.data.authUrl));
    }
    spinner.text = 'Waiting for authentication...';
    // Poll for completion
    const maxAttempts = 60; // 5 minutes with 5 second intervals
    let attempts = 0;
    while (attempts < maxAttempts) {
        await sleep(5000);
        attempts++;
        const pollResponse = await api.pollCliAuth(state);
        if (pollResponse.error) {
            spinner.fail('Authentication failed');
            return {
                success: false,
                message: pollResponse.error.message,
            };
        }
        if (pollResponse.data?.status === 'complete') {
            const { accessToken, refreshToken, user, account } = pollResponse.data;
            if (!accessToken || !refreshToken || !user || !account) {
                spinner.fail('Invalid authentication response');
                return {
                    success: false,
                    message: 'Invalid authentication response',
                };
            }
            const credentials = {
                accessToken,
                refreshToken,
                expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
                user,
                account,
            };
            saveCredentials(credentials);
            spinner.succeed(`Logged in as ${chalk.green(user.email)}`);
            return {
                success: true,
                message: `Logged in as ${user.email}`,
                credentials,
            };
        }
        if (pollResponse.data?.status === 'expired') {
            spinner.fail('Authentication session expired');
            return {
                success: false,
                message: 'Authentication session expired. Please try again.',
            };
        }
    }
    spinner.fail('Authentication timed out');
    return {
        success: false,
        message: 'Authentication timed out. Please try again.',
    };
}
export async function loginWithCredentials(email, password) {
    const spinner = ora('Logging in...').start();
    const response = await api.login(email, password);
    if (response.error || !response.data) {
        spinner.fail('Login failed');
        return {
            success: false,
            message: response.error?.message || 'Login failed',
        };
    }
    const { accessToken, refreshToken, user, accounts } = response.data;
    // Use first account as default
    const account = accounts[0];
    if (!account) {
        spinner.fail('No accounts found');
        return {
            success: false,
            message: 'No accounts found for this user',
        };
    }
    const credentials = {
        accessToken,
        refreshToken,
        expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
        user,
        account,
    };
    saveCredentials(credentials);
    spinner.succeed(`Logged in as ${chalk.green(user.email)}`);
    return {
        success: true,
        message: `Logged in as ${user.email}`,
        credentials,
    };
}
export async function loginWithToken(token) {
    const spinner = ora('Validating token...').start();
    // Temporarily set the token to test it
    process.env.SKILLSDOJO_TOKEN = token;
    const response = await api.me();
    if (response.error || !response.data) {
        delete process.env.SKILLSDOJO_TOKEN;
        spinner.fail('Invalid token');
        return {
            success: false,
            message: response.error?.message || 'Invalid token',
        };
    }
    const { user, accounts } = response.data;
    const account = accounts[0];
    if (!account) {
        delete process.env.SKILLSDOJO_TOKEN;
        spinner.fail('No accounts found');
        return {
            success: false,
            message: 'No accounts found for this token',
        };
    }
    // Store as credentials (with long expiry since it's an API key)
    const credentials = {
        accessToken: token,
        refreshToken: '',
        expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
        user,
        account,
    };
    saveCredentials(credentials);
    delete process.env.SKILLSDOJO_TOKEN;
    spinner.succeed(`Logged in as ${chalk.green(user.email)}`);
    return {
        success: true,
        message: `Logged in as ${user.email}`,
        credentials,
    };
}
export function logout() {
    clearCredentials();
}
export function getCurrentUser() {
    return getCredentials();
}
export function requireAuth() {
    const creds = getCredentials();
    if (!creds || !creds.accessToken) {
        console.error(chalk.red('Error: Not authenticated'));
        console.error(chalk.gray('Run `sdojo auth login` to authenticate'));
        process.exit(1);
    }
    // Check if token is expired
    if (creds.expiresAt < Date.now()) {
        console.error(chalk.red('Error: Session expired'));
        console.error(chalk.gray('Run `sdojo auth login` to re-authenticate'));
        process.exit(1);
    }
    return creds;
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//# sourceMappingURL=auth.js.map