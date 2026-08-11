/**
 * Username -> player profile lookup. search.searchAnything only returns
 * matching entity IDs, not usernames — so we hydrate the first few
 * candidates and pick the case-insensitive exact match, falling back to
 * the first candidate if none matches exactly (the API's fuzziness isn't
 * confirmed; this is the safest honest behavior until verified live).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as warera from "@/lib/warera/api";
import type { Company, PlayerProfile } from "@/lib/warera/models";

export interface PlayerLookupResult {
  status: "ok" | "not-found" | "unavailable" | "error";
  reason?: string;
  profile?: PlayerProfile;
  companies?: Company[];
}

const MAX_CANDIDATES_TO_CHECK = 5;

export const lookupPlayerByUsername = createServerFn({ method: "GET" })
  .validator(z.object({ username: z.string().min(1) }))
  .handler(async ({ data }): Promise<PlayerLookupResult> => {
    const searchResult = await warera.searchUsers(data.username);
    if (searchResult.status !== "ok") {
      return { status: searchResult.status, reason: searchResult.reason };
    }
    if (searchResult.data.length === 0) {
      return { status: "not-found", reason: `No players matched "${data.username}".` };
    }

    const candidateIds = searchResult.data.slice(0, MAX_CANDIDATES_TO_CHECK);
    const profileResults = await Promise.all(candidateIds.map((id) => warera.getUserProfile(id)));

    const target = data.username.toLowerCase();
    let match = profileResults.find((r) => r.status === "ok" && r.data.username.toLowerCase() === target);
    if (!match) match = profileResults.find((r) => r.status === "ok");

    if (!match || match.status !== "ok") {
      return { status: "not-found", reason: `Found candidates but couldn't load a full profile for any of them.` };
    }

    const companyIdsResult = await warera.getCompanyIds({ userId: match.data.id, perPage: 10 });
    let companies: Company[] = [];
    if (companyIdsResult.status === "ok" && companyIdsResult.data.ids.length > 0) {
      const companyResults = await Promise.all(companyIdsResult.data.ids.map((id) => warera.getCompanyById(id)));
      companies = companyResults.filter((r) => r.status === "ok").map((r) => (r as { status: "ok"; data: Company }).data);
    }

    return { status: "ok", profile: match.data, companies };
  });
