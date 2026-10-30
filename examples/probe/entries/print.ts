export async function printResponse(label: string, response: Response, randomRequestId: boolean = false) {
  console.log(label);
  console.log(`status: ${response.status}`);
  const headers: string[] = [];
  response.headers.forEach((value, key) => {
    if (randomRequestId && key === "x-request-id") {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
        throw new Error("Invalid randomUUID v4 header");
      }
      value = "<uuid-v4>";
    }
    headers.push(`${key}: ${value}`);
  });
  console.log(`headers: ${JSON.stringify(headers.sort())}`);
  console.log(`body: ${await response.text()}`);
}
