import { NextRequest, NextResponse } from "next/server";

const request = new NextRequest("http://probe.test/?preview=1");
console.log(NextResponse.json({ preview: request.nextUrl.searchParams.get("preview") }).status);
