declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.css';
declare module '*.svg';

declare module '@corva/ui/clients' {
  export const corvaDataAPI: {
    get: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
    post: (url: string, data?: unknown) => Promise<unknown>;
    put: (url: string, data?: unknown) => Promise<unknown>;
    delete: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  export const corvaAPI: {
    get: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
    post: (url: string, data?: unknown) => Promise<unknown>;
    put: (url: string, data?: unknown) => Promise<unknown>;
    delete: (url: string, params?: Record<string, unknown>) => Promise<unknown>;
  };
  export const socketClient: {
    subscribe: (config: Record<string, unknown>, handlers: Record<string, unknown>) => () => void;
  };
}

declare module '@corva/ui/componentsV2' {
  import { FC, ReactNode } from 'react';
  export const AppContainer: FC<{ header: ReactNode; testId?: string; children: ReactNode }>;
  export const AppHeader: FC;
}
