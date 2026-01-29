import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  loginWithBrowser,
  loginWithCredentials,
  loginWithToken,
  logout,
  getCurrentUser,
} from '../lib/auth.js';
import { getCredentials, getConfig } from '../lib/config.js';

export const authCommand = new Command('auth')
  .description('Manage authentication');

// sdojo auth login
authCommand
  .command('login')
  .description('Authenticate with SkillsDojo')
  .option('-t, --token [token]', 'Login with API token (optionally provide token value)')
  .option('-u, --email <email>', 'Email address')
  .option('-p, --password <password>', 'Password')
  .action(async (options) => {
    // Token-based login
    if (options.token) {
      let token = typeof options.token === 'string' ? options.token : null;

      // If token not provided as value, prompt for it
      if (!token) {
        const answer = await inquirer.prompt([
          {
            type: 'password',
            name: 'token',
            message: 'Enter your API token:',
            mask: '*',
          },
        ]);
        token = answer.token;
      }

      const result = await loginWithToken(token);
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      return;
    }

    // Credential-based login (for CI/scripts)
    if (options.email && options.password) {
      const result = await loginWithCredentials(options.email, options.password);
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
      return;
    }

    // Interactive login (email/password prompt or browser)
    const { method } = await inquirer.prompt([
      {
        type: 'list',
        name: 'method',
        message: 'How would you like to log in?',
        choices: [
          { name: 'Open browser (recommended)', value: 'browser' },
          { name: 'Enter email and password', value: 'credentials' },
          { name: 'Enter API token', value: 'token' },
        ],
      },
    ]);

    if (method === 'browser') {
      const result = await loginWithBrowser();
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
    } else if (method === 'credentials') {
      const { email, password } = await inquirer.prompt([
        {
          type: 'input',
          name: 'email',
          message: 'Email:',
          validate: (input) => input.includes('@') || 'Please enter a valid email',
        },
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
        },
      ]);

      const result = await loginWithCredentials(email, password);
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
    } else {
      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Enter your API token:',
          mask: '*',
        },
      ]);

      const result = await loginWithToken(token);
      if (!result.success) {
        console.error(chalk.red(result.message));
        process.exit(1);
      }
    }
  });

// sdojo auth logout
authCommand
  .command('logout')
  .description('Clear stored credentials')
  .action(() => {
    logout();
    console.log(chalk.green('Logged out successfully'));
  });

// sdojo auth whoami
authCommand
  .command('whoami')
  .description('Show current authenticated user')
  .action(() => {
    const creds = getCurrentUser();

    if (!creds) {
      console.log(chalk.yellow('Not logged in'));
      console.log(chalk.gray('Run `sdojo auth login` to authenticate'));
      return;
    }

    const config = getConfig();

    console.log(`Logged in as: ${chalk.green(creds.user.email)}`);
    console.log(`Account: ${chalk.cyan(creds.account.slug)} (${creds.account.name})`);
    console.log(`API: ${chalk.gray(config.api.url)}`);

    // Check token expiry
    if (creds.expiresAt < Date.now()) {
      console.log(chalk.yellow('\nWarning: Session expired. Run `sdojo auth login` to re-authenticate.'));
    }
  });

// sdojo auth switch <account>
authCommand
  .command('switch <account>')
  .description('Switch active account context')
  .action(async (accountSlug) => {
    const creds = getCredentials();

    if (!creds) {
      console.error(chalk.red('Not logged in'));
      console.error(chalk.gray('Run `sdojo auth login` to authenticate'));
      process.exit(1);
    }

    // TODO: Fetch user's accounts and switch
    // For now, just update the account slug
    console.log(chalk.yellow('Account switching not yet implemented'));
    console.log(chalk.gray(`Requested switch to: ${accountSlug}`));
  });
