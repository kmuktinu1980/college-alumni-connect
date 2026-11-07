import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Plain-language reason a Claude API call failed, for the person using the
 * site and for the server log. Never includes the API key.
 */
export function describeClaudeError(e: unknown): { message: string; setup: boolean } {
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  if (e instanceof Anthropic.APIError) {
    const detail = String((e.error as { error?: { message?: string } } | undefined)?.error?.message ?? e.message ?? "");
    if (e.status === 401)
      return { setup: true, message: "Setup problem: the Claude API key isn't valid. Check ANTHROPIC_API_KEY in Vercel (no quotes or spaces), then redeploy." };
    if (e.status === 403)
      return { setup: true, message: "Setup problem: the Claude API key doesn't have permission for this. Check the key's workspace in console.anthropic.com." };
    if (/workspace/i.test(detail) && /scoped|anthropic-workspace-id/i.test(detail))
      return { setup: true, message: "Setup problem: this Claude API key isn't tied to a workspace. In console.anthropic.com, create a new key inside a workspace (e.g. Default), put it in ANTHROPIC_API_KEY in Vercel, and redeploy." };
    if (/credit balance|billing|purchase credits/i.test(detail))
      return { setup: true, message: "Setup problem: the Claude API account has no credit. Add credit at console.anthropic.com → Billing, then try again." };
    if (e.status === 404 || /model/i.test(detail) && /not.*(found|exist|available)/i.test(detail))
      return { setup: true, message: `Setup problem: the model "${model}" isn't available to this API key. Set ANTHROPIC_MODEL in Vercel to a model your account can use.` };
    if (e.status === 413) return { setup: false, message: "That file is too large to read. Try pasting your profile text instead." };
    if (e.status === 429) return { setup: false, message: "Claude is getting a lot of requests right now. Wait a minute and try again." };
    if (e.status === 529 || (e.status ?? 0) >= 500) return { setup: false, message: "Claude is temporarily busy. Try again in a minute." };
    if (e.status === 400) return { setup: false, message: `Claude couldn't process that file: ${detail.slice(0, 200)}` };
  }
  if (e instanceof Anthropic.APIConnectionTimeoutError) return { setup: false, message: "Reading your profile took too long. Try again, or paste the text instead." };
  if (e instanceof Anthropic.APIConnectionError) return { setup: false, message: "Couldn't reach Claude. Try again in a minute." };
  return { setup: false, message: "Couldn't read that profile right now. Try again, or fill in the form directly." };
}
