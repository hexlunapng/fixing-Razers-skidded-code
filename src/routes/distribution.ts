import { Hono } from 'hono';
import fs from 'fs'
import path from 'path'

const router = new Hono();

router.get('/launcher/api/public/distributionpoints/', (c) => {
  return c.json({
    distributions: [
      'https://download.epicgames.com/',
      'https://download2.epicgames.com/',
      'https://download3.epicgames.com/',
      'https://download4.epicgames.com/',
      'https://epicgames-download1.akamaized.net/',
      'https://aegisbackend.ol.epicgames.com/',
    ],
  });
});

router.get('/launcher/api/public/assets/*', async (c) => {
  return c.json({
    appName: 'FortniteContentBuilds',
    labelName: 'AegisBackend',
    buildVersion: '++Fortnite+Release-20.00-CL-19458861-Windows',
    catalogItemId: '5cb97847cee34581afdbc445400e2f77',
    expires: '9999-12-31T23:59:59.999Z',
    items: {
      MANIFEST: {
        signature: 'AegisBackend',
        distribution: 'https://AegisBackend.ol.epicgames.com/',
        path: 'Builds/Fortnite/Content/CloudDir/AegisBackend.manifest',
        hash: '55bb954f5596cadbe03693e1c06ca73368d427f3',
        additionalDistributions: [],
      },
      CHUNKS: {
        signature: 'AegisBackend',
        distribution: 'https://AegisBackend.ol.epicgames.com/',
        path: 'Builds/Fortnite/Content/CloudDir/AegisBackend.manifest',
        additionalDistributions: [],
      },
    },
    assetId: 'FortniteContentBuilds',
  });
});

router.get('/Builds/Fortnite/Content/CloudDir/:file.manifest', async (c) => {
  const manifestPath = path.join(__dirname, '..', '..', 'static', 'CloudDir', 'AegisBackend.manifest')
  const manifest = fs.readFileSync(manifestPath)

  c.header('Content-Type', 'application/octet-stream')
  return c.body(manifest, 200)
})

router.get('/Builds/Fortnite/Content/CloudDir/:file.chunk', async (c) => {
  const chunkPath = path.join(__dirname, '..', '..', 'static', 'CloudDir', 'AegisBackend.chunk')
  const chunk = fs.readFileSync(chunkPath)

  c.header('Content-Type', 'application/octet-stream')
  return c.body(chunk, 200)
})

router.get('/Builds/Fortnite/Content/CloudDir/:file.ini', async (c) => {
  const iniPath = path.join(__dirname, '..', '..', 'static', 'CloudDir', 'Full.ini')
  const ini = fs.readFileSync(iniPath)

  return c.body(ini, 200)
})

export default router;
