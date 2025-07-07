declare module 'next-pwa/register' {
  const register: any;
  export = register;
}

declare global {
  interface Window {
    workbox?: {
      addEventListener: (event: string, handler: (event: any) => void) => void;
      register: () => void;
    };
  }
}