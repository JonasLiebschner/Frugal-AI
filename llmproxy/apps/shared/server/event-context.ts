import type { H3Event } from "h3";

export function assignEventContext(
  event: H3Event,
  values: Record<string, unknown>,
): void {
  Object.assign(event.context as Record<string, unknown>, values);
}

export function setEventContextValue<TValue>(
  event: H3Event,
  key: string,
  value: TValue,
): void {
  (event.context as Record<string, unknown>)[key] = value;
}
