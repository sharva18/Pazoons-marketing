// Runtime config. Test mode is ON unless explicitly turned off.
export const config = {
  get testMode() {
    return process.env.MESSAGING_TEST_MODE !== "false";
  },
  get appUrl() {
    return (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  },
  get secret() {
    // signs unsubscribe links; set a long random APP_SECRET in production
    return process.env.APP_SECRET || "dev-only-secret-change-me";
  },
  twilio: {
    get sid() {
      return process.env.TWILIO_ACCOUNT_SID || "";
    },
    get token() {
      return process.env.TWILIO_AUTH_TOKEN || "";
    },
    get from() {
      return process.env.TWILIO_FROM_NUMBER || "+15005550006"; // Twilio's magic test "from" number
    },
  },
  postmark: {
    get token() {
      return process.env.POSTMARK_SERVER_TOKEN || "";
    },
    get from() {
      return process.env.POSTMARK_FROM_EMAIL || "promos@example.com";
    },
    get webhookToken() {
      return process.env.POSTMARK_WEBHOOK_TOKEN || "";
    },
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
};
