import { AsyncLocalStorage } from 'node:async_hooks';

export interface AccessContext {
  tenantId: string;
  apiKeyId: string;
}

const accessContextStore = new AsyncLocalStorage<AccessContext>();

export const runWithAccessContext = <T>(context: AccessContext, callback: () => T): T => {
  return accessContextStore.run(context, callback);
};

export const setAccessContext = (context: AccessContext) => {
  accessContextStore.enterWith(context);
};

export const getAccessContext = (): AccessContext => {
  const context = accessContextStore.getStore();
  if (!context) {
    throw new Error('Access context is not available');
  }

  return context;
};
