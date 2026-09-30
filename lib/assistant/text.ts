/**
 * Shared, dependency-free text helpers for the Support Assistant:
 * phrase normalisation, tokenising, elongation collapsing, stemming,
 * canonical IT synonyms and Damerau-Levenshtein / trigram similarity.
 *
 * Everything here is pure so it can run on the client (live hints) and the
 * server (matching) alike.
 */

/** Common English words. Used to tell real words from keyboard mashing. */
export const COMMON_WORDS = new Set(
  `a about above after again against all almost alone along already also although always am among an and another any anymore anyone anything anyway anywhere are around as ask asked asking at away back bad be because become been before behind being below best better between big bit both but by came can cannot cant could couldnt day days did didnt do does doesnt doing done dont down during each easy either else end enough even ever every everyone everything everywhere few find fine first fix fixed fixing for found from full gave get gets getting give given go goes going gone good got great had hand happen happened happening happens hard has hasnt have havent having he help her here hers him his how however i if im in instead into is isnt it its itself ive just keep keeping keeps kind know last late lately least left less let like likely little long look looking looks lot lots made make makes making many may maybe me mean might mine minute minutes more morning most much must my myself need needed needs never new next nice night no none nor not nothing now of off often oh ok okay old on once one only onto open opened opening opens or other others our out over own part past people person please put quite rather really right same saw say says see seem seems seen set several she should show shown since so some somehow someone something sometimes somewhere soon sorry start started still stop stopped such suddenly sure take taken takes tell than thank thanks that thats the their them then there these they thing things think this those though through time times to today together told tomorrow too took tried tries try trying turn turned twice two under unless until up upon us use used using usual usually very via want wanted was wasnt way we week well went were what whatever when whenever where whether which while who whole whom whose why will with within without wont work worked working works would wouldnt wrong yes yesterday yet you your yours
  able access account accounts add added again ago alert allow already another answer anyone appear appeared appears area asks available because become black blank blocked blue body box break broke broken button call called calls cannot case change changed check checked clear click close closed closes code come comes coming company complete computer connect correct could couldnt cut delete deleted different doing double drop dropped each else email empty enter error errors every except fail failed failing fails far fast file files finish first follow forgot forgotten frequently front gets goes green hear heard hello home hour hours inside keep last later latest light lights line list load loaded loading loads lock locked log long lose losing lost loud making message messages middle minute missing mode month name never number office order page pages paper part phone picture place plug plugged point power press pressed problem problems random reach read ready reason red remote remove removed reply report reset restart restarted return right room run running runs said save saved saying school screen search second seconds send sending sent shows shut side sign signed slow slowly small sound space speed stays step steps stuck support system tab text their then thing though top trouble type typing unable unknown upload used user wait waiting warm warning watch white whole window word words write wrong years
  able actually almost anything basically completely definitely every exactly literally maybe nearly obviously probably randomly really recently seriously simply sometimes totally usually
  home house car dog cat food water coffee book music movie game games friend friends family mom dad kid kids class student teacher homework weather rain sun city country world money price store buy bought pay paid job boss manager coworker colleague meeting meetings desk chair floor wall door window room building office`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Everyday non-IT topics. They are real words (never "typo-corrected" into IT
 * terms) and, with no IT words present, mark a message as off-topic.
 */
export const NON_IT_WORDS = new Set(
  `weather forecast temperature recipe recipes cook cooking bake baking pizza burger dinner lunch breakfast restaurant movie movies film netflix song songs lyrics singer football soccer basketball baseball nba nfl cricket homework essay poem poetry story joke jokes riddle horoscope zodiac astrology dating girlfriend boyfriend crush marriage stock stocks crypto bitcoin investing capital president election politics math calculus algebra equation translate translation travel flight flights hotel vacation workout diet`
    .split(/\s+/)
    .filter(Boolean)
);

/** Household and vehicle devices that should not match workplace IT guides. */
export const NON_IT_DEVICES = new Set([
  "fridge",
  "fridges",
  "refrigerator",
  "freezer",
  "dishwasher",
  "washer",
  "dryer",
  "oven",
  "microwave",
  "stove",
  "cooker",
  "hob",
  "kettle",
  "toaster",
  "blender",
  "dehumidifier",
  "humidifier",
  "boiler",
  "furnace",
  "aircon",
  "vacuum",
  "hoover",
  "car",
  "cars",
  "vehicle",
  "truck",
  "motorbike",
  "bike",
  "bicycle",
  "scooter",
  "washing machine",
  "coffee machine",
  "coffee maker",
  "air conditioner",
  "air fryer",
  "car radio",
]);

/** IT / support vocabulary that is not necessarily in the guides' text. */
export const IT_WORDS = new Set(
  `wifi wireless wlan internet online offline network networking router modem hotspot ethernet lan cable vpn proxy dns ip dhcp firewall bandwidth ping latency connection connectivity connect connected connecting disconnect disconnected disconnecting disconnects dropping drops dropped
  computer pc laptop desktop notebook macbook chromebook imac ipad iphone android tablet phone smartphone mobile device devices workstation server monitor display screen screens keyboard mouse trackpad touchpad webcam camera cam mic microphone headset headphones earbuds airpods speaker speakers audio sound volume bluetooth usb hdmi displayport dock docking charger charging battery adapter port ports drive drives disk ssd hdd storage memory ram cpu gpu fan overheating overheat hot bios uefi driver drivers firmware
  windows mac macos ios linux ubuntu os chrome chromeos safari edge firefox browser browsers
  email emails mail outlook gmail inbox outbox mailbox calendar invite invites attachment attachments spam junk phishing
  password passwords passcode pwd pw pin login logon signin signout username account accounts mfa 2fa otp authenticator sso okta duo locked lockout expired reset
  printer printers print printing prints printed scanner scan toner ink cartridge jam jammed queue spooler
  app apps application applications program programs software install installed installing installation uninstall update updates updating upgrade crash crashes crashing crashed freeze freezes freezing frozen hang hangs hanging lag laggy lagging sluggish slow unresponsive reboot restart boot booting startup shutdown bsod kernel panic error popup popups virus malware antivirus ransomware trojan spyware adware hacked hijacked encryption encrypted bitlocker filevault
  zoom teams slack webex meet skype excel word powerpoint onedrive sharepoint dropbox gdrive icloud canvas office365 microsoft google apple adobe acrobat pdf pdfs teams
  file files folder folders document documents upload uploads download downloads sync syncing synced share shared sharing permission permissions quota backup recover recovery restore version history preview
  notification notifications alert alerts status channel chat message messaging video recording record breakout background hotspot enroll enrollment mdm profile resolution scaling brightness blurry flicker flickering pixel cursor click clicking typing keys touch touchscreen stylus
  tech it helpdesk ticket support admin administrator`
    .split(/\s+/)
    .filter(Boolean)
);

/**
 * Canonical forms for common IT synonyms. Every key maps to the token used
 * for matching, so "wireless", "wi-fi" and "wifi" all look the same.
 */
export const SYNONYM_GROUPS: Record<string, string[]> = {
  wifi: ["wifi", "wireless", "wlan"],
  internet: [
    "internet",
    "online",
    "web",
    "connection",
    "connectivity",
    "connect",
    "connected",
    "connecting",
    "network",
    "networking",
  ],
  computer: [
    "computer",
    "pc",
    "laptop",
    "desktop",
    "notebook",
    "workstation",
    "macbook",
    "chromebook",
  ],
  email: ["email", "mail", "outlook", "gmail", "inbox", "mailbox", "emails"],
  password: ["password", "passwords", "pw", "pwd", "passcode", "passwd"],
  camera: ["camera", "cam", "webcam", "cameras"],
  mic: ["mic", "microphone", "mike"],
  sound: ["sound", "audio", "speaker", "speakers", "volume", "hear", "hearing"],
  print: ["print", "printer", "printers", "printing", "prints", "printed"],
  slow: ["slow", "lag", "laggy", "lagging", "sluggish", "slowly", "slowness"],
  freeze: [
    "freeze",
    "freezes",
    "freezing",
    "frozen",
    "hang",
    "hangs",
    "hanging",
    "unresponsive",
    "responding",
  ],
  crash: ["crash", "crashes", "crashing", "crashed"],
  disconnect: [
    "disconnect",
    "disconnects",
    "disconnecting",
    "disconnected",
    "drop",
    "drops",
    "dropping",
    "dropped",
  ],
  signin: ["signin", "login", "logon", "log", "sign", "logging", "signing"],
  display: ["monitor", "display", "monitors", "displays"],
  start: ["start", "boot", "booting", "startup", "boots"],
  storage: ["storage", "space", "disk", "full"],
  update: ["update", "updates", "updating", "upgrade", "upgrading"],
  install: ["install", "installation", "installing", "installed"],
  battery: ["battery", "charge", "charging", "drain", "draining", "drains"],
  phone: ["phone", "iphone", "android", "mobile", "cell", "smartphone"],
  meeting: ["meeting", "meetings", "zoom", "teams", "webex", "call", "calls"],
  antivirus: ["virus", "malware", "antivirus", "trojan", "spyware"],
  popup: ["popup", "popups", "ads"],
  ethernet: ["ethernet", "wired", "cable", "lan"],
  "2fa": ["2fa", "mfa", "authenticator", "otp", "verification"],
  lost: ["lost", "deleted", "delete", "missing", "recover", "recovery"],
  locked: ["locked", "lockout", "lock"],
  app: [
    "app",
    "apps",
    "application",
    "applications",
    "program",
    "programs",
    "excel",
    "powerpoint",
    "photoshop",
    "acrobat",
  ],
  drive: ["onedrive", "dropbox", "sharepoint", "drive", "gdrive"],
  chat: ["slack", "chat", "channel"],
  touchpad: ["touchpad", "trackpad"],
  hijack: ["hijack", "hijacked", "redirect", "redirects"],
  stolen: ["stolen", "theft"],
  expired: ["expired", "expire", "expires"],
  forgot: ["forgot", "forgotten", "forget"],
  invite: ["invite", "invites", "invitation", "invitations"],
  notification: ["notification", "notifications", "alerts", "alert"],
  recognize: ["recognize", "recognized", "detect", "detected", "recognise"],
  jam: ["jam", "jammed", "jams"],
  sync: ["sync", "syncing", "synced", "synchronize"],
};

export const CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(SYNONYM_GROUPS).flatMap(([canonical, words]) =>
    words.map((word) => [word, canonical])
  )
);

/**
 * Words that carry no information about *which* guide applies. They are
 * dropped from matching and from "is this a real description?" checks.
 */
export const GENERIC_WORDS = new Set(
  `a an the is are was were be been being am have has had do does did will would could should may might must can shall of for in on at to from by with about into through during before after and or but so if then than when where why how what who which this that these those i me my mine you your he she it its we us our they them their not no nor wont cant cannot doesnt isnt dont didnt wasnt arent aint working work works worked problem problems issue issues help please keeps keep kept still just really very anymore since today get getting got im ive its any some there here up out off again also now lately something anything thing stuff wrong broken fix fixed need needs want hey hi hello thanks thank ok okay yes yeah error errors weird strange suddenly always sometimes randomly down`
    .split(/\s+/)
    .filter(Boolean)
);

const PHRASE_REWRITES: [RegExp, string][] = [
  [/\bwi[\s-]?fi\b/g, "wifi"],
  [/\be[\s-]mails?\b/g, "email"],
  [/\b(?:sign|log)[\s-]?(?:in|on)\b/g, "signin"],
  [/\b(?:sign|log)[\s-]?out\b/g, "signout"],
  [/\bpop[\s-]?ups?\b/g, "popup"],
  [/\bweb[\s-]?cam(?:era)?s?\b/g, "webcam"],
  [/\bblue[\s-]?screen(?: of death)?\b/g, "bsod"],
  [/\bone[\s-]?drive\b/g, "onedrive"],
  [/\bhot[\s-]?spot\b/g, "hotspot"],
  [/\bpass[\s-]word\b/g, "password"],
  [/\b(?:touch|track)[\s-]?pad\b/g, "touchpad"],
  [/\b(?:two|2|multi)[\s-](?:factor|step)\b/g, "2fa"],
  [/\bwon['’]?t\b/g, "wont"],
  [/\b(?:can['’]?t|cannot|can not)\b/g, "cant"],
  [/\b(?:doesn['’]?t|does not)\b/g, "doesnt"],
  [/\b(?:isn['’]?t|is not)\b/g, "isnt"],
  [/\b(?:don['’]?t|do not)\b/g, "dont"],
  [/['’]/g, ""],
];

/** Lower-case and rewrite multi-word IT phrases into single tokens. */
export function normalizePhrases(value: string): string {
  let text = value.toLowerCase();
  for (const [pattern, replacement] of PHRASE_REWRITES) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

/** Split into lower-case alphanumeric tokens (after phrase rewrites). */
export function tokenize(value: string): string[] {
  return normalizePhrases(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Collapse any run of the same character longer than `max` down to `max`. */
export function collapseRepeats(token: string, max = 1): string {
  let out = "";
  let run = 0;
  for (let index = 0; index < token.length; index += 1) {
    run = index > 0 && token[index] === token[index - 1] ? run + 1 : 1;
    if (run <= max) out += token[index];
  }
  return out;
}

/** Very small suffix stemmer; good enough for guide keywords. */
export function stem(token: string): string {
  if (token.endsWith("ies") && token.length - 3 >= 3) {
    return `${token.slice(0, -3)}y`;
  }
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, -suffix.length);
    }
  }
  return token;
}

/** Map a token to its canonical matching form. */
export function canonicalize(token: string): string {
  return CANONICAL[token] ?? CANONICAL[stem(token)] ?? stem(token);
}

/** Optimal-string-alignment Damerau-Levenshtein distance. */
export function damerauLevenshtein(
  left: string,
  right: string,
  limit = Infinity
): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const d: number[][] = Array.from({ length: rows }, () =>
    Array<number>(cols).fill(0)
  );
  for (let i = 0; i < rows; i += 1) d[i][0] = i;
  for (let j = 0; j < cols; j += 1) d[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let value = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        left[i - 1] === right[j - 2] &&
        left[i - 2] === right[j - 1]
      ) {
        value = Math.min(value, d[i - 2][j - 2] + 1);
      }
      d[i][j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[left.length][right.length];
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    grams.add(padded.slice(index, index + 3));
  }
  return grams;
}

/** Jaccard similarity of character trigrams (0–1). */
export function trigramSimilarity(left: string, right: string): number {
  const a = trigrams(left);
  const b = trigrams(right);
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared || 1);
}

/** Allowed edit distance for a typo of a word with this length. */
export function typoBudget(length: number): number {
  if (length < 4) return 0;
  if (length <= 5) return 1;
  return 2;
}
