export function mcpError(message: string, type = "bad_request") {
  return {
    error: {
      message,
      type,
    },
  };
}
