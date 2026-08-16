import { config } from 'dotenv';

config({ path: new URL('../../../.env', import.meta.url), quiet: true });
config({ quiet: true });
