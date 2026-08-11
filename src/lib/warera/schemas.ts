/**
 * Runtime validation for raw WarEra API responses.
 *
 * These schemas are intentionally permissive on fields we don't consume
 * (`.passthrough()` / loose records) but strict on the fields the economy
 * and combat engines actually depend on — if one of those disappears or
 * changes type, we want a loud, typed failure (caught in api.ts and
 * surfaced as DATA UNAVAILABLE) instead of a silent `undefined` flowing
 * into a profit calculation.
 */
import { z } from "zod";

export const ItemPricesSchema = z.record(z.string(), z.number());

export const TradingOrderSchema = z
  .object({
    _id: z.string(),
    user: z.string(),
    itemCode: z.string(),
    quantity: z.number(),
    price: z.number(),
    offerAt: z.string(),
    type: z.enum(["buy", "sell"]),
  })
  .passthrough();

export const TopOrdersSchema = z.object({
  buyOrders: z.array(TradingOrderSchema),
  sellOrders: z.array(TradingOrderSchema),
});

export const ProducedItemSchema = z
  .object({
    code: z.string(),
    type: z.string(),
    rarity: z.string(),
    usage: z.string().optional(),
    isTradable: z.boolean().optional(),
    isConsumable: z.boolean().optional(),
    isDeposit: z.boolean().optional(),
    skinSlot: z.string().optional(),
    climates: z.array(z.string()).optional(),
    productionPoints: z.number().optional(),
    productionNeeds: z.record(z.string(), z.number()).optional(),
    flatStats: z.record(z.string(), z.number()).optional(),
    dynamicStats: z.record(z.string(), z.array(z.number())).optional(),
    iconImg: z.string().optional(),
  })
  .passthrough();

export const GameConfigItemsSchema = z.record(z.string(), ProducedItemSchema);

export const UpgradeLevelSchema = z
  .object({
    level: z.number(),
    steelCost: z.number(),
    constructionPointsCost: z.number().optional(),
    maintenanceCostCountryDevScale: z.number().optional(),
    maintenanceCostRegionDevScale: z.number().optional(),
    maintenanceCost: z.number().optional(),
    minimumMaintenanceCost: z.number().optional(),
    stats: z.record(z.string(), z.number()),
  })
  .passthrough();

export const UpgradeDefinitionSchema = z
  .object({
    canDowngrade: z.boolean().optional(),
    canBeDisabled: z.boolean().optional(),
    canBeDestroyed: z.boolean().optional(),
    pendingDurationHours: z.number().optional(),
    levels: z.record(z.string(), UpgradeLevelSchema),
  })
  .passthrough();

export const UpgradesConfigSchema = z.record(z.string(), UpgradeDefinitionSchema);

export const SkillLevelSchema = z.object({
  totalCost: z.number(),
  value: z.number(),
  unlockAtLevel: z.number().optional(),
  isABar: z.boolean().optional(),
});

export const SkillTrackSchema = z.object({
  levels: z.record(z.string(), SkillLevelSchema),
});

export const GameConfigSkillsSchema = z.record(z.string(), SkillTrackSchema);

export const GameConfigBattleSchema = z.object({
  allianceDamagesBonusPercent: z.number(),
  enemyDamagesBonusPercent: z.number(),
  patrioticBonusPercent: z.number(),
  countryOrderBonusPercent: z.number(),
  muOrderBonusPercent: z.number(),
  lostAttackingRegionMalusPercent: z.number(),
  occupyingYourRegionsMalusPercent: z.number(),
  regionNotLinkedToCapitalMalusPercent: z.number(),
  healthCost: z.number(),
  maxRounds: z.number(),
  pointsToWinRound: z.number(),
  roundsToWin: z.number(),
  casesPer1kDamagesInPool: z.number(),
  hitFor1CaseInPool: z.number(),
  setCountryOrderMoneyCost: z.number(),
  setMuOrderMoneyCost: z.number(),
  setOrderMoneyCost: z.number(),
  tickPoints: z.record(z.string(), z.number()),
});

export const GameConfigCompanySchema = z
  .object({
    changeItemCost: z.number(),
    constructionCostIncreasePerCompany: z.number(),
    depositResourceBonus: z.number(),
    destructionValuePercent: z.number(),
    moveCost: z.number(),
  })
  .passthrough();

export const GameConfigWorkerSchema = z
  .object({
    fidelityProductionBonusPercent: z.number(),
    maxFidelity: z.number(),
  })
  .passthrough();

export const GameConfigRegionSchema = z
  .object({
    battleCooldownHours: z.number(),
    decreaseBy: z.number(),
    decreaseResistanceCost: z.number(),
    depleteHourlyPercent: z.number(),
    increaseBy: z.number(),
    increaseResistanceCost: z.number(),
    maxDailyResistance: z.number(),
    maxResistance: z.number(),
    minDailyResistance: z.number(),
  })
  .passthrough();

export const GameConfigSchema = z
  .object({
    items: GameConfigItemsSchema,
    upgradesConfig: UpgradesConfigSchema,
    skills: GameConfigSkillsSchema,
    battle: GameConfigBattleSchema,
    company: GameConfigCompanySchema,
    worker: GameConfigWorkerSchema,
    region: GameConfigRegionSchema,
  })
  .passthrough();

export const CompanySchema = z
  .object({
    _id: z.string(),
    user: z.string(),
    region: z.string(),
    itemCode: z.string(),
    name: z.string(),
    production: z.number(),
    workerCount: z.number(),
    workers: z.array(z.unknown()),
    isFull: z.boolean(),
    concreteInvested: z.number(),
    estimatedValue: z.number(),
    activeUpgradeLevels: z.record(z.string(), z.number().optional()),
  })
  .passthrough();

export const CompanyListPageSchema = z.object({
  items: z.array(z.string()),
  nextCursor: z.string().optional(),
});

export const CompanyProductionBonusSchema = z.object({
  strategicBonus: z.number(),
  depositBonus: z.number(),
  ethicSpecializationBonus: z.number(),
  ethicDepositBonus: z.number(),
  total: z.number(),
});

export const WorkersResponseSchema = z.object({
  type: z.string(),
  workersPerCompany: z.array(
    z
      .object({
        company: z.object({ _id: z.string(), itemCode: z.string(), name: z.string() }),
        workers: z.array(z.unknown()),
      })
      .passthrough(),
  ),
});

export const WorkOfferSchema = z
  .object({
    _id: z.string(),
    company: z.string(),
    region: z.string(),
    user: z.string(),
    wage: z.number(),
    quantity: z.number(),
    initialQuantity: z.number(),
    minEnergy: z.number().optional(),
    minProduction: z.number().optional(),
    citizenship: z.string().optional(),
    text: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();

export const WorkOfferPageSchema = z.object({
  items: z.array(WorkOfferSchema),
  nextCursor: z.string().optional(),
});

export const RegionSchema = z
  .object({
    _id: z.string(),
    code: z.string(),
    name: z.string(),
    mainCity: z.string(),
    country: z.string(),
    countryCode: z.string(),
    biome: z.string(),
    climate: z.string(),
    position: z.array(z.number()),
    neighbors: z.array(z.string()),
    isCapital: z.boolean(),
    isLinkedToCapital: z.boolean(),
    development: z.number(),
    baseDevelopment: z.number(),
    resistance: z.number(),
    resistanceMax: z.number(),
    activeUpgradeLevels: z.record(z.string(), z.number()).optional(),
    upgradesV2: z.object({
      upgrades: z.record(
        z.string(),
        z
          .object({
            level: z.number(),
            constructionPoints: z.number(),
            investedMoney: z.number(),
            status: z.string().optional(),
          })
          .passthrough(),
      ),
      activeConstructionCount: z.number(),
    }),
    deposit: z
      .object({
        type: z.string(),
        bonusPercent: z.number(),
        startsAt: z.string(),
        endsAt: z.string(),
      })
      .optional(),
    strategicResource: z.string().optional(),
    stats: z.object({ investedMoney: z.number() }),
  })
  .passthrough();

export const RegionsObjectSchema = z.record(z.string(), RegionSchema);

export const RankingEntrySchema = z.object({
  value: z.number(),
  rank: z.number(),
  tier: z.string(),
});

export const CountrySchema = z
  .object({
    _id: z.string(),
    name: z.string(),
    code: z.string(),
    money: z.number(),
    development: z.number(),
    orgs: z.array(z.string()),
    allies: z.array(z.string()),
    warsWith: z.array(z.string()),
    taxes: z.object({ income: z.number(), market: z.number(), selfWork: z.number() }),
    rankings: z.record(z.string(), RankingEntrySchema),
  })
  .passthrough();

export const CountriesSchema = z.array(CountrySchema);

export const UpgradeInstanceSchema = z
  .object({
    _id: z.string(),
    upgradeType: z.string(),
    level: z.number(),
    status: z.string(),
    investedSteel: z.number(),
    investedConcrete: z.number(),
    investedMoney: z.number(),
    dependantUsersCount: z.number(),
    company: z.string().optional(),
    region: z.string().optional(),
    mu: z.string().optional(),
  })
  .passthrough();

export const LiveBattleDataSchema = z.object({
  battle: z
    .object({
      isActive: z.boolean(),
      attackerCountryOrders: z.array(z.string()),
      defenderCountryOrders: z.array(z.string()),
      roundIds: z.array(z.string()),
    })
    .passthrough(),
  round: z
    .object({
      roundId: z.string(),
      isActive: z.boolean(),
      attackerDamages: z.number(),
      defenderDamages: z.number(),
      attackerPoints: z.number(),
      defenderPoints: z.number(),
      actualTickPoints: z.number(),
      nextTickAt: z.string(),
    })
    .passthrough(),
});

export const BattleRankingSchema = z.object({
  rankings: z.array(
    z
      .object({
        user: z.string().optional(),
        country: z.string().optional(),
        value: z.number(),
        rank: z.number(),
        _id: z.string(),
      })
      .passthrough(),
  ),
});

export const RoundWeaponSchema = z.object({
  _id: z.string(),
  code: z.string(),
  state: z.number(),
  maxState: z.number(),
  quantity: z.number(),
  skills: z.object({ attack: z.number(), criticalChance: z.number() }),
});

export const RoundEquipmentSchema = z.object({
  _id: z.string(),
  code: z.string(),
  type: z.string(),
  state: z.number(),
  maxState: z.number(),
  quantity: z.number(),
  skills: z.record(z.string(), z.number()),
});

export const LastHitSchema = z
  .object({
    _id: z.string(),
    user: z.string(),
    mu: z.string().optional(),
    ammo: z.string().optional(),
    weapon: RoundWeaponSchema.optional(),
    equipments: z.array(RoundEquipmentSchema).optional(),
    damages: z.number(),
    isCriticalHit: z.boolean(),
    missed: z.boolean(),
    hitAt: z.string(),
  })
  .passthrough();

export const LastHitsSchema = z.object({
  attacker: z.array(LastHitSchema),
  defender: z.array(LastHitSchema),
});

export const MuSchema = z
  .object({
    _id: z.string(),
    user: z.string(),
    region: z.string(),
    name: z.string(),
    members: z.array(z.string()),
    roles: z.object({ managers: z.array(z.string()), commanders: z.array(z.string()) }),
    leveling: z.object({ level: z.number(), monthlyDamages: z.number() }),
    activeUpgradeLevels: z.record(z.string(), z.number()),
    rankings: z.record(z.string(), RankingEntrySchema),
    avatarUrl: z.string(),
  })
  .passthrough();

export const SearchResultSchema = z.object({
  hasData: z.boolean(),
  userIds: z.array(z.string()),
  muIds: z.array(z.string()),
});

const userSkillStandardSchema = z.object({
  level: z.number(),
  equipment: z.number().optional(),
  total: z.number(),
});

const userSkillAttackSchema = z.object({
  level: z.number(),
  weapon: z.number(),
  equipment: z.number().optional(),
  ammoPercent: z.number(),
  buffsPercent: z.number(),
  debuffsPercent: z.number(),
  militaryRankPercent: z.number(),
  total: z.number(),
});

const userSkillBarSchema = z.object({
  level: z.number(),
  currentBarValue: z.number(),
  hourlyBarRegen: z.number(),
  total: z.number(),
});

export const UserLiteSchema = z.object({
  username: z.string(),
  country: z.string(),
  mu: z.string().optional(),
  militaryRank: z.number(),
  isActive: z.boolean(),
  leveling: z.object({ level: z.number(), totalXp: z.number(), availableSkillPoints: z.number() }),
  skills: z.object({
    attack: userSkillAttackSchema,
    armor: userSkillStandardSchema,
    dodge: userSkillStandardSchema,
    criticalChance: userSkillStandardSchema,
    criticalDamages: userSkillStandardSchema,
    precision: userSkillStandardSchema,
    production: userSkillBarSchema,
    companies: userSkillStandardSchema,
    management: userSkillStandardSchema,
    lootChance: userSkillStandardSchema,
    entrepreneurship: userSkillBarSchema,
  }),
  rankings: z.record(z.string(), RankingEntrySchema),
});

export const UserByIdSchema = z.object({
  _id: z.string(),
  username: z.string(),
  country: z.string(),
  mu: z.string().optional(),
  company: z.string().optional(),
  militaryRank: z.number(),
  isActive: z.boolean(),
  leveling: z.object({ level: z.number(), totalXp: z.number(), availableSkillPoints: z.number() }),
  equipment: z.record(z.string(), z.string()).optional(),
});


export const EquippedItemSchema = z.object({
  _id: z.string(),
  code: z.string(),
  state: z.number(),
  maxState: z.number(),
  quantity: z.number(),
  skills: z.record(z.string(), z.number()),
});

export const CurrentEquipmentSchema = z.object({
  ammo: z.string().optional(),
  weapon: EquippedItemSchema.optional(),
  helmet: EquippedItemSchema.optional(),
  chest: EquippedItemSchema.optional(),
  gloves: EquippedItemSchema.optional(),
  pants: EquippedItemSchema.optional(),
  boots: EquippedItemSchema.optional(),
});
