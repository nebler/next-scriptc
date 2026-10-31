"use server";

import { redirect } from "next/navigation";
import { echo } from "./native-example.ts";

export async function reportAction(formData: FormData): Promise<void> {
  const value = await echo(String(formData.get("value") ?? "Revenue report"));
  redirect(`/reports?message=${encodeURIComponent(value)}`);
}
