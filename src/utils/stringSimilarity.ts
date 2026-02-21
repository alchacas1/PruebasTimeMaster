export type BestStringMatch = {
  best: string | null;
  score: number;
};

const SPANISH_STOPWORDS = new Set([
  "A",
  "AL",
  "CON",
  "DA",
  "DE",
  "DEL",
  "DES",
  "DI",
  "DO",
  "EL",
  "EN",
  "LA",
  "LAS",
  "LOS",
  "PARA",
  "POR",
  "SAN",
  "SANTA",
  "Y",
]);

function analyzeForComparison(input: string): { tokens: string[]; normalized: string } {
  const value = typeof input === "string" ? input : String(input ?? "");
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

  const rawTokens = cleaned.split(/\s+/).filter(Boolean);
  const tokens = rawTokens.filter((t) => !SPANISH_STOPWORDS.has(t));
  return { tokens, normalized: tokens.join("") };
}

export function normalizeForComparison(input: string): string {
  return analyzeForComparison(input).normalized;
}

function jaroSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchDistance = Math.max(0, Math.floor(Math.max(aLen, bLen) / 2) - 1);
  const aMatches = new Array<boolean>(aLen).fill(false);
  const bMatches = new Array<boolean>(bLen).fill(false);

  let matches = 0;
  for (let i = 0; i < aLen; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, bLen);

    for (let j = start; j < end; j += 1) {
      if (bMatches[j]) continue;
      if (a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches += 1;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let bIndex = 0;
  for (let i = 0; i < aLen; i += 1) {
    if (!aMatches[i]) continue;
    while (bIndex < bLen && !bMatches[bIndex]) bIndex += 1;
    if (bIndex < bLen && a[i] !== b[bIndex]) transpositions += 1;
    bIndex += 1;
  }

  const t = transpositions / 2;
  return (
    matches / aLen +
    matches / bLen +
    (matches - t) / matches
  ) / 3;
}

function jaroWinklerOnNormalized(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const jaro = jaroSimilarity(a, b);

  let prefix = 0;
  const maxPrefix = Math.min(4, a.length, b.length);
  while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix += 1;

  const scalingFactor = 0.1;
  return jaro + prefix * scalingFactor * (1 - jaro);
}

function tokenSimilarity(aToken: string, bToken: string): number {
  if (!aToken || !bToken) return 0;
  if (aToken === bToken) return 1;

  const shorter = aToken.length <= bToken.length ? aToken : bToken;
  const longer = aToken.length <= bToken.length ? bToken : aToken;

  // Strong signal for morphological variants like SENSACION vs SENSACIONALES
  if (shorter.length >= 5 && longer.startsWith(shorter)) return 1;

  return jaroWinklerOnNormalized(aToken, bToken);
}

export function jaroWinklerSimilarity(aRaw: string, bRaw: string): number {
  const aInfo = analyzeForComparison(aRaw);
  const bInfo = analyzeForComparison(bRaw);
  const a = aInfo.normalized;
  const b = bInfo.normalized;
  if (!a || !b) return 0;

  let score = jaroWinklerOnNormalized(a, b);

  // Compare by tokens as well (order-independent-ish signal)
  const aTokens = aInfo.tokens;
  const bTokens = bInfo.tokens;
  if (aTokens.length > 0 && bTokens.length > 0) {
    let bestTokenScore = 0;
    for (const at of aTokens) {
      for (const bt of bTokens) {
        const s = tokenSimilarity(at, bt);
        if (s > bestTokenScore) bestTokenScore = s;
      }
    }

    // If we have a very strong token match, elevate overall score.
    if (bestTokenScore >= 0.9) {
      score = Math.max(score, Math.min(1, bestTokenScore));
    }
  }

  // Heurística: si los tokens del nombre corto están contenidos en el largo,
  // considerarlo "muy similar" (ej: "PLATA" vs "LA PLATA").
  if (aTokens.length > 0 && bTokens.length > 0) {
    const aSet = new Set(aTokens);
    const bSet = new Set(bTokens);
    const aSubsetOfB = aTokens.every((t) => bSet.has(t));
    const bSubsetOfA = bTokens.every((t) => aSet.has(t));
    if (aSubsetOfB || bSubsetOfA) {
      score = Math.max(score, 0.95);
    }
  }

  return score;
}

export function findBestStringMatch(
  target: string,
  candidates: string[]
): BestStringMatch {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { best: null, score: 0 };
  }

  let best: string | null = null;
  let score = 0;

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    const s = jaroWinklerSimilarity(target, candidate);
    if (s > score) {
      score = s;
      best = candidate;
    }
  }

  return { best, score };
}
