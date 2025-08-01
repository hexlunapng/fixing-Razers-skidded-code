import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Log } from "./logger";

interface ItemGrant {
  templateId: string;
  quantity: number;
}

interface Requirement {
  requirementType: string;
  requiredId: string;
  minQuantity: number;
}

interface Price {
  currencyType: string;
  currencySubType: string;
  regularPrice: number;
  finalPrice: number;
  saleExpiration: string;
  basePrice: number;
}

interface MetaInfo {
  key: string;
  value: string;
}

interface CatalogEntry {
  devName: string;
  offerId: string;
  fulfillmentIds: string[];
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  categories: string[];
  prices: Price[];
  meta: {
    SectionId: string;
    TileSize: string;
  };
  matchFilter: string;
  filterWeight: number;
  appStoreId: any[];
  requirements: Requirement[];
  offerType: string;
  giftInfo: {
    bIsEnabled: boolean;
    forcedGiftBoxTemplateId: string;
    purchaseRequirements: any[];
    giftRecordIds: any[];
  };
  refundable: boolean;
  metaInfo: MetaInfo[];
  displayAssetPath: string;
  itemGrants: ItemGrant[];
  sortPriority: number;
  catalogGroupPriority: number;
}

interface CatalogStorefront {
  name: string;
  catalogEntries: CatalogEntry[];
}

interface Catalog {
  storefronts: CatalogStorefront[];
}

interface CatalogConfigEntry {
  itemGrants: string[];
  price: number;
}

interface CatalogConfig {
  [key: string]: CatalogConfigEntry;
}

export function getItemShop(): Catalog {
  const catalogPath = path.join(__dirname, "..", "..", "static", "ItemShop", "catalog.json");
  const catalogConfigPath = path.join(__dirname, "..", "..", "static", "ItemShop", "catalog_config.json");

  const catalog: Catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const CatalogConfig: CatalogConfig = JSON.parse(fs.readFileSync(catalogConfigPath, "utf8"));

  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(24, 0, 0, 0);
  const todayOneMinuteBeforeMidnight = new Date(todayAtMidnight.getTime() - 60000);
  const isoDate = todayOneMinuteBeforeMidnight.toISOString();

  try {
    for (const key in CatalogConfig) {
      const configEntry = CatalogConfig[key];
      if (!Array.isArray(configEntry?.itemGrants) || configEntry.itemGrants.length === 0) continue;

      const CatalogEntry: CatalogEntry = {
        devName: "",
        offerId: "",
        fulfillmentIds: [],
        dailyLimit: -1,
        weeklyLimit: -1,
        monthlyLimit: -1,
        categories: [],
        prices: [{
          currencyType: "MtxCurrency",
          currencySubType: "",
          regularPrice: 0,
          finalPrice: 0,
          saleExpiration: "9999-12-02T01:12:00Z",
          basePrice: 0,
        }],
        meta: {
          SectionId: "Daily",
          TileSize: "Small",
        },
        matchFilter: "",
        filterWeight: 0,
        appStoreId: [],
        requirements: [],
        offerType: "StaticPrice",
        giftInfo: {
          bIsEnabled: true,
          forcedGiftBoxTemplateId: "",
          purchaseRequirements: [],
          giftRecordIds: [],
        },
        refundable: true,
        metaInfo: [
          { key: "SectionId", value: "Daily" },
          { key: "TileSize", value: "Small" },
        ],
        displayAssetPath: "",
        itemGrants: [],
        sortPriority: 0,
        catalogGroupPriority: 0,
      };

      const storefrontName = key.toLowerCase().startsWith("daily") ? "BRDailyStorefront" : "BRWeeklyStorefront";
      const i = catalog.storefronts.findIndex((p) => p.name === storefrontName);
      if (i === -1) continue;

      if (key.toLowerCase().startsWith("daily")) {
        CatalogEntry.sortPriority = -1;
      } else {
        CatalogEntry.meta.SectionId = "Featured"
        CatalogEntry.meta.TileSize = "Normal";
        if (CatalogEntry.metaInfo && CatalogEntry.metaInfo.length > 1 && CatalogEntry.metaInfo[0] && CatalogEntry.metaInfo[1]) {
            CatalogEntry.metaInfo[0].value = "Featured";
            CatalogEntry.metaInfo[1].value = "Normal";
        }
        CatalogEntry.categories = ["Featured"]
      }

      for (const itemGrant of configEntry.itemGrants) {
        if (typeof itemGrant !== "string" || itemGrant.length === 0) continue;

        CatalogEntry.requirements.push({
          requirementType: "DenyOnItemOwnership",
          requiredId: itemGrant,
          minQuantity: 1,
        });

        CatalogEntry.itemGrants.push({
          templateId: itemGrant,
          quantity: 1,
        });
      }

      CatalogEntry.prices = [{
        currencyType: "MtxCurrency",
        currencySubType: "",
        regularPrice: configEntry.price,
        finalPrice: configEntry.price,
        saleExpiration: isoDate,
        basePrice: configEntry.price,
      }];

      if (CatalogEntry.itemGrants.length > 0) {
        const uniqueIdentifier = crypto
          .createHash("sha1")
          .update(`${JSON.stringify(configEntry.itemGrants)}_${configEntry.price}`)
          .digest("hex");

        CatalogEntry.devName = uniqueIdentifier;
        CatalogEntry.offerId = uniqueIdentifier;

        const storefront = catalog.storefronts[i];
        if (!storefront) continue;

        storefront.catalogEntries.push(CatalogEntry);
      }
    }
  } catch (err) {
    Log.Error("Error while getting item shop: ", err)
  }

  return catalog;
}

interface OfferResult {
  name: string;
  offerId: CatalogEntry;
}

export async function getOfferID(offerId: string): Promise<OfferResult | undefined> {
  const catalog = await getItemShop();

  for (const storefront of catalog.storefronts) {
    const findOfferId = storefront.catalogEntries.find(i => i.offerId === offerId);
    if (findOfferId) {
      return {
        name: storefront.name,
        offerId: findOfferId,
      };
    }
  }

  return undefined
}