import { Hono } from "hono";
import { GetVersionInfo } from "../utils/functions";

const router = new Hono();

router.get('/fortnite/api/calendar/v1/timeline', async (c) => {
    const memory = GetVersionInfo(c.req)
    
    const todayAtMidnight = new Date();
    todayAtMidnight.setHours(24, 0, 0, 0)
    const todayOneMinuteBeforeMidnight = new Date(todayAtMidnight.getTime() - 60000);
    const isoDate = todayOneMinuteBeforeMidnight.toISOString()

    var activeEvents = [
        {
            "eventType": `EventFlag.Season${memory.season}`,
            "activeUntil": "9999-01-01T00:00:00.000Z",
            "activeSince": "2020-01-01T00:00:00.000Z"
        },
        {
            "eventType": `EventFlag.${memory.lobby}`,
            "activeUntil": "9999-01-01T00:00:00.000Z",
            "activeSince": "2020-01-01T00:00:00.000Z"
        }
    ];

    const stateTemplate = {
        "activeStorefronts": [],
        "eventNamedWeights": {},
        "seasonNumber": memory.season,
        "seasonTemplateId": `AthenaSeason:athenaseason${memory.season}`,
        "matchXpBonusPoints": 0,
        "seasonBegin": "2020-01-01T13:00:00Z",
        "seasonEnd": process.env.SEASON_END,
        "seasonDisplayedEnd": "9999-01-01T07:30:00Z",
        "weeklyStoreEnd": isoDate,
        "sectionStoreEnds": {
            "Featured": isoDate
        },
        "dailyStoreEnd": isoDate
    };

    var states = [
        {
            validFrom: "0001-01-01T00:00:00.000Z",
            activeEvents: activeEvents.slice(),
            state: stateTemplate
        }
    ]

    return c.json({
        "channels": {
            "client-matchmaking": {
                "states": [],
                "cacheExpire": "9999-01-01T00:00:00.000Z"
            },
            "client-events": {
                "states": states,
                "cacheExpire": "9999-01-01T00:00:00.000Z"
            }
        },
        "eventsTimeOffsetHrs": 0,
        "cacheIntervalMins": 10,
        "currentTime": new Date().toISOString()
    })
})

export default router