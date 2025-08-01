import { Hono } from "hono";

const router = new Hono();

router.post('/fortnite/api/game/v2/chat/*/*/*/*', (c) => c.json({}));

router.post('/fortnite/api/game/v2/grant_access/*', (c) => c.body(null, 204));

router.get('/waitingroom/api/waitingroom', (c) => c.body(null, 204));

router.get('/socialban/api/public/v1/*', (c) => {
  return c.json({
    bans: [],
    warnings: []
  });
});

router.get('/fortnite/api/statsv2/account/:accountId', (c) => {
  const accountId = c.req.param("accountId");
  return c.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId
  });
});

router.get('/statsproxy/api/statsv2/account/:accountId', (c) => {
  const accountId = c.req.param("accountId");
  return c.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId
  });
});

router.get('/fortnite/api/stats/accountId/:accountId/bulk/window/alltime', (c) => {
  const accountId = c.req.param("accountId");
  return c.json({
    startTime: 0,
    endTime: 0,
    stats: {},
    accountId
  });
});

router.post('/fortnite/api/feedback/*', (c) => c.body(null, 200));

router.post('/fortnite/api/statsv2/query', (c) => c.json([]));

router.post('/statsproxy/api/statsv2/query', (c) => c.json([]));

router.post('/fortnite/api/game/v2/events/v2/setSubgroup/*', (c) => c.body(null, 204));

router.get('/fortnite/api/game/v2/enabled_features', (c) => c.json([]));

router.get('/fortnite/api/game/v2/twitch/*', (c) => c.body(null, 200));

router.get('/fortnite/api/game/v2/world/info', (c) => c.json({}));

router.get('/presence/api/v1/_/*/last-online', (c) => c.json({}));

router.get('/fortnite/api/game/v2/leaderboards/cohort/*', (c) => c.json([]));

router.get('/region', (c) => {
  return c.json({
    continent: {
      code: "EU",
      geoname_id: 6255148,
      names: {
        de: "Europa",
        en: "Europe",
        es: "Europa",
        it: "Europa",
        fr: "Europe",
        ja: "ヨーロッパ",
        "pt-BR": "Europa",
        ru: "Европа",
        "zh-CN": "欧洲"
      }
    },
    country: {
      geoname_id: 2635167,
      is_in_european_union: false,
      iso_code: "GB",
      names: {
        de: "UK",
        en: "United Kingdom",
        es: "RU",
        it: "Stati Uniti",
        fr: "Royaume Uni",
        ja: "英国",
        "pt-BR": "Reino Unido",
        ru: "Британия",
        "zh-CN": "英国"
      }
    },
    subdivisions: [
      {
        geoname_id: 6269131,
        iso_code: "ENG",
        names: {
          de: "England",
          en: "England",
          es: "Inglaterra",
          it: "Inghilterra",
          fr: "Angleterre",
          ja: "イングランド",
          "pt-BR": "Inglaterra",
          ru: "Англия",
          "zh-CN": "英格兰"
        }
      },
      {
        geoname_id: 3333157,
        iso_code: "KEC",
        names: {
          en: "Royal Kensington and Chelsea"
        }
      }
    ]
  });
});

router.post('/datarouter/api/v1/public/data', (c) => c.body(null, 204));

export default router;
