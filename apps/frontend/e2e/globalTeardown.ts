import { stop } from './mockExpressServer';

export default async function globalTeardown(): Promise<void> {
  await stop();
}
