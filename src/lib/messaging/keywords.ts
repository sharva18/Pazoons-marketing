// Inbound SMS keywords. Canada: honour French keywords too.
export type Keyword = "stop" | "start" | "help" | null;

const STOP = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt out", "arret", "arrêt", "arrete", "arrête"];
const START = ["start", "unstop", "yes", "subscribe"];
const HELP = ["help", "info", "aide"];

export function parseKeyword(body: string): Keyword {
  const v = body
    .trim()
    .toLowerCase()
    .replace(/[.!?"']+$/g, "")
    .trim();
  if (STOP.includes(v)) return "stop";
  if (START.includes(v)) return "start";
  if (HELP.includes(v)) return "help";
  return null;
}
