export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const causeMessage = readErrorCauseMessage(error);
    if (causeMessage && causeMessage !== error.message) {
      return `${error.message} (${causeMessage})`;
    }

    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function readErrorCauseMessage(error: Error): string | undefined {
  const cause = "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;

  if (cause instanceof Error) {
    return cause.message;
  }

  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }

  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return undefined;
}
