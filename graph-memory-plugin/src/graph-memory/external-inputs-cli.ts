import { CONFIG } from "./config.js";
import {
  ensureExternalInputsConfig,
  loadExternalInputsConfig,
  refreshExternalInputs,
  saveExternalInputsConfig,
} from "./external-inputs.js";

function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

async function main() {
  const cmd = process.argv[2] || "status";

  switch (cmd) {
    case "init": {
      printJson(ensureExternalInputsConfig());
      return;
    }
    case "status": {
      printJson({
        graphRoot: CONFIG.paths.graphRoot,
        configPath: CONFIG.paths.inputsConfig,
        config: loadExternalInputsConfig(),
      });
      return;
    }
    case "enable-gmail": {
      printJson(saveExternalInputsConfig({
        sources: {
          gmail: {
            enabled: true,
            mode: "brief_only",
            filters: {
              lookbackMode: "recent_window",
              labels: ["INBOX", "STARRED"],
              senders: [],
              unreadOnly: false,
              sinceHours: 36,
              maxMessages: 10,
              dropAutomated: true,
              ignoredSubjectPatterns: [
                "google alert",
                "newsletter",
                "daily digest",
                "weekly digest",
                "unsubscribe",
                "sale",
                "off your",
                "deal",
                "promotion",
                "sponsored",
                "recommended for you",
              ],
              ignoredSenderPatterns: [
                "no-reply",
                "noreply",
                "do-not-reply",
                "notifications@",
                "mailer-daemon",
              ],
            },
          },
        },
      }));
      return;
    }
    case "enable-calendar": {
      printJson(saveExternalInputsConfig({
        sources: {
          calendar: {
            enabled: true,
            mode: "brief_only",
          },
        },
      }));
      return;
    }
    case "refresh": {
      const timeZone = process.argv[3] || CONFIG.session.dailyAnalysisTimeZone;
      printJson({
        graphRoot: CONFIG.paths.graphRoot,
        timeZone,
        batches: refreshExternalInputs(timeZone),
      });
      return;
    }
    default:
      throw new Error(`Unknown external-inputs command: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
