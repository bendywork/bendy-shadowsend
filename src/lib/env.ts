import { APP_VERSION } from "@/lib/constants";

export const env = {
  appVersion: APP_VERSION,
  // Existing installations retain the auth value already stored in their database.
  appAuth: process.env.APP_AUTH?.trim() || "bendywork",
};

