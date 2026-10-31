"use native";

export async function echo(value: string): Promise<string> {
  return value;
}

export async function fail(message: string): Promise<string> {
  throw new Error(message);
}
