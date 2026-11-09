import process from 'node:process';

if (process.env.NODE_ENV === 'production' || process.env.CI === 'true') {
  process.exit(0);
}

const { default: husky } = await import('husky');
husky();
