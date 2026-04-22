export type HttpRequest = {
  method?: string;
  body?: unknown;
};

export type HttpResponse = {
  status(code: number): HttpResponse;
  send(body: unknown): void;
  json(body: unknown): void;
};