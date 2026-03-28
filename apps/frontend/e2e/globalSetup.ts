import { start } from './mockExpressServer';

export default async function globalSetup(): Promise<void> {
  await start();
}
