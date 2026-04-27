type DenoServeHandler = (req: Request) => Response | Promise<Response>;

interface DenoRuntime {
  env: {
    get(name: string): string | undefined;
  };
  serve(handler: DenoServeHandler): void;
}

declare const Deno: DenoRuntime;