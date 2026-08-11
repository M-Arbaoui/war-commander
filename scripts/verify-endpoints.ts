/**
 * Live smoke test — NOT run in CI/this sandbox (no network access to
 * api2.warera.io here). Run this once from an environment that CAN reach the
 * live API (e.g. locally, or a Vercel preview) before trusting Phase 1's
 * "confidence" ratings in procedures.ts:
 *
 *   npx tsx scripts/verify-endpoints.ts
 *
 * It hits every registered procedure with a minimal real input, prints the
 * actual response shape, and flags anything that doesn't match our Zod
 * schemas — i.e. it turns "typed-only" and "captured" confidence ratings
 * into "verified-live-on-<date>" or tells you exactly what broke.
 */
import { ALL_PROCEDURES } from "../src/lib/warera/procedures";
import { wareraGet } from "../src/lib/warera/client";
import * as schemas from "../src/lib/warera/schemas";

// Minimal real IDs to probe entity-scoped endpoints with. These are
// deliberately left BLANK — fill in a real region/company/battle ID you've
// observed in-game before running, or the corresponding checks will just
// report "skipped (no sample id configured)".
const SAMPLE_IDS = {
  companyId: "",
  regionId: "",
  countryId: "",
  battleId: "",
  roundId: "",
  muId: "",
  itemCode: "grain",
};

const SCHEMA_BY_PROCEDURE: Record<string, keyof typeof schemas> = {
  "itemTrading.getPrices": "ItemPricesSchema",
  "tradingOrder.getTopOrders": "TopOrdersSchema",
  "gameConfig.getGameConfig": "GameConfigSchema",
  "company.getById": "CompanySchema",
  "company.getCompanies": "CompanyListPageSchema",
  "company.getProductionBonus": "CompanyProductionBonusSchema",
  "worker.getWorkers": "WorkersResponseSchema",
  "workOffer.getWorkOffersPaginated": "WorkOfferPageSchema",
  "region.getRegionsObject": "RegionsObjectSchema",
  "country.getAllCountries": "CountriesSchema",
  "upgrade.getUpgradeByTypeAndEntity": "UpgradeInstanceSchema",
  "battle.getLiveBattleData": "LiveBattleDataSchema",
  "battleRanking.getRanking": "BattleRankingSchema",
  "round.getLastHits": "LastHitsSchema",
  "mu.getById": "MuSchema",
  "inventory.fetchCurrentEquipment": "CurrentEquipmentSchema",
};

function buildInput(procedure: string): Record<string, unknown> | undefined {
  switch (procedure) {
    case "tradingOrder.getTopOrders":
      return { itemCode: SAMPLE_IDS.itemCode };
    case "company.getById":
      return SAMPLE_IDS.companyId ? { companyId: SAMPLE_IDS.companyId } : undefined;
    case "company.getCompanies":
      return { perPage: 5 };
    case "company.getProductionBonus":
      return SAMPLE_IDS.companyId ? { companyId: SAMPLE_IDS.companyId } : undefined;
    case "worker.getWorkers":
      return SAMPLE_IDS.companyId ? { companyId: SAMPLE_IDS.companyId } : undefined;
    case "workOffer.getWorkOffersPaginated":
      return { limit: 5 };
    case "region.getById":
      return SAMPLE_IDS.regionId ? { regionId: SAMPLE_IDS.regionId } : undefined;
    case "country.getCountryById":
      return SAMPLE_IDS.countryId ? { countryId: SAMPLE_IDS.countryId } : undefined;
    case "upgrade.getUpgradeByTypeAndEntity":
      return SAMPLE_IDS.companyId ? { upgradeType: "base", companyId: SAMPLE_IDS.companyId } : undefined;
    case "battle.getLiveBattleData":
    case "battle.getById":
      return SAMPLE_IDS.battleId ? { battleId: SAMPLE_IDS.battleId } : undefined;
    case "battleRanking.getRanking":
      return SAMPLE_IDS.battleId
        ? { battleId: SAMPLE_IDS.battleId, type: "country", side: "merged" }
        : undefined;
    case "round.getById":
    case "round.getLastHits":
      return SAMPLE_IDS.roundId ? { roundId: SAMPLE_IDS.roundId } : undefined;
    case "mu.getById":
      return SAMPLE_IDS.muId ? { muId: SAMPLE_IDS.muId } : undefined;
    default:
      return undefined;
  }
}

async function main() {
  console.log(`Verifying ${ALL_PROCEDURES.length} registered WarEra procedures against the live API...\n`);
  let okCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const def of ALL_PROCEDURES) {
    const input = buildInput(def.procedure);
    const needsSample = def.procedure.match(
      /\.(getById|getCountryById|getWorkers|getProductionBonus|getUpgradeByTypeAndEntity)$/,
    );
    if (needsSample && input === undefined && def.procedure !== "company.getCompanies") {
      console.log(`⏭  ${def.procedure} — skipped (no sample id configured in SAMPLE_IDS)`);
      skipCount++;
      continue;
    }
    if (def.auth === "required") {
      console.log(`⏭  ${def.procedure} — skipped (requires a user session token; see api.ts)`);
      skipCount++;
      continue;
    }

    try {
      const raw = await wareraGet<unknown>(def.procedure, input, { retries: 1 });
      const schemaName = SCHEMA_BY_PROCEDURE[def.procedure];
      if (schemaName) {
        const schema = schemas[schemaName] as { safeParse: (v: unknown) => { success: boolean; error?: unknown } };
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          console.log(`⚠️  ${def.procedure} — responded but FAILED schema validation:`);
          console.log(JSON.stringify(parsed.error, null, 2).slice(0, 1000));
          failCount++;
          continue;
        }
      }
      console.log(`✅ ${def.procedure} — OK`);
      console.log(JSON.stringify(raw, null, 2).slice(0, 500));
      okCount++;
    } catch (err) {
      console.log(`❌ ${def.procedure} — request failed: ${err instanceof Error ? err.message : String(err)}`);
      failCount++;
    }
    console.log("");
  }

  console.log(`\nDone. ${okCount} ok, ${failCount} failed, ${skipCount} skipped.`);
  if (failCount > 0) process.exitCode = 1;
}

main();
