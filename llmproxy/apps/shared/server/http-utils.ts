export function proxyError(message: string, type = "proxy_error"): { error: { message: string; type: string } } {
  return {
    error: {
      message,
      type,
    },
  };
}
