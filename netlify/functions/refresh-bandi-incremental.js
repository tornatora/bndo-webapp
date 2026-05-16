"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var refresh_bandi_incremental_exports = {};
__export(refresh_bandi_incremental_exports, {
  config: () => config,
  handler: () => handler
});
module.exports = __toCommonJS(refresh_bandi_incremental_exports);
const config = {
  schedule: "0 15 * * *"
};
function resolveBaseUrl() {
  const raw = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || process.env.NEXT_PUBLIC_MARKETING_URL || "";
  const value = String(raw).trim();
  if (!value) {
    throw new Error("Base URL Netlify non disponibile per il refresh incrementale bandi.");
  }
  return value.replace(/\/+$/, "");
}
async function handler() {
  const baseUrl = resolveBaseUrl();
  const endpoint = `${baseUrl}/api/jobs/refresh-bandi-incremental`;
  const secret = String(process.env.CRON_SECRET || "").trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      ...secret ? { "x-cron-secret": secret } : {}
    }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Refresh bandi incrementale fallito (${response.status}): ${body.slice(0, 400)}`);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      endpoint,
      body: body.slice(0, 400)
    })
  };
}
