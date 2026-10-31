// Compatibility entrypoint; both variants now share build and deploy settings.
process.env.NEXT_SCRIPTC_BASELINE = "node";
await import("./deploy.mjs");
