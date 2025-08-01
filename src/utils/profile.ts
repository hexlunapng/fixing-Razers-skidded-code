import fs from "fs";
import path from "path";

export function createProfiles(accountId: string): Record<string, any> {
  const profiles: Record<string, any> = {};
  const defaultProfilesPath = path.join(__dirname, "../../static/profiles");

  fs.readdirSync(defaultProfilesPath).forEach((fileName) => {
    const profile = require(path.join(defaultProfilesPath, fileName));

    profile.accountId = accountId;
    profile.created = new Date().toISOString();
    profile.updated = new Date().toISOString();

    profiles[profile.profileId] = profile;
  });

  return profiles;
}

export async function validateProfile(
  profileId: string,
  profiles: { profiles: Record<string, any> }
): Promise<boolean> {
  try {
    const profile = profiles.profiles[profileId];
    if (!profile || !profileId) throw new Error("Invalid profile/profileId");
  } catch {
    return false;
  }
  return true;
}
