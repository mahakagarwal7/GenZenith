import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions extends RequestInit {
  retries?: number;
  retryDelay?: number;
  abortTimeout?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct.includes("application/json") || ct.includes("+json");
}

async function readBodySnippet(response: Response, maxLen = 500): Promise<string> {
  try {
    const text = await response.text();
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  } catch {
    return "";
  }
}

/**
 * Production-grade fetch wrapper with:
 * - Exponential backoff
 * - AbortController timeout
 * - Typed error handling
 * - Automatic toast notifications for critical failures
 */
export async function fetchWithRetry<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { 
    retries = 3, 
    retryDelay = 1000, 
    abortTimeout = 10000, 
    ...fetchOptions 
  } = options;

  let lastError: Error | null = null;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), abortTimeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorData: any = undefined;

        if (isJsonContentType(contentType)) {
          try {
            errorData = await response.json();
          } catch {
            errorData = { message: response.statusText };
          }
        } else {
          const snippet = await readBodySnippet(response);
          errorData = {
            message: response.statusText,
            contentType,
            snippet,
          };
        }

        throw new ApiError(response.status, errorData?.message || "API Failure", errorData);
      }

      if (response.status === 204) {
        return null as T;
      }

      const contentType = response.headers.get("content-type");
      if (!isJsonContentType(contentType)) {
        const snippet = await readBodySnippet(response);
        throw new Error(
          `Expected JSON but got ${contentType || "unknown content-type"} from ${url}. ` +
            (snippet ? `Body: ${snippet}` : "")
        );
      }

      try {
        return (await response.json()) as T;
      } catch {
        const snippet = await readBodySnippet(response);
        throw new Error(`Invalid JSON returned from ${url}. ${snippet ? `Body: ${snippet}` : ""}`);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      lastError = error;

      if (error.name === "AbortError") {
        console.error(`🔴 Request timed out: ${url}`);
        throw new Error("Request timed out. Please check your connection.");
      }

      // Don't retry client errors (4xx) except maybe 429
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }

      if (i < retries) {
        const delay = retryDelay * Math.pow(2, i);
        await sleep(delay);
      }
    }
  }

  toast.error("Network synchronization failed. Retrying...");
  throw lastError;
}
