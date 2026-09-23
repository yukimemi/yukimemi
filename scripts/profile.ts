// Regenerates the profile: terminal-style header SVGs (dark/light) and the
// "Recent releases" block of README.md. Run by .github/workflows/profile.yml.
//
//   GITHUB_TOKEN=... deno run -A scripts/profile.ts

const LOGIN = Deno.env.get("PROFILE_LOGIN") ?? "yukimemi";
const TOKEN = Deno.env.get("GITHUB_TOKEN") ?? Deno.env.get("GH_TOKEN");
if (!TOKEN) throw new Error("GITHUB_TOKEN (or GH_TOKEN) is required");

const root = new URL("../", import.meta.url);

type Repo = {
  name: string;
  url: string;
  description: string | null;
  stargazerCount: number;
  primaryLanguage: { name: string } | null;
  latestRelease: { tagName: string; publishedAt: string; url: string } | null;
};

const query = `
query($login: String!, $cursor: String) {
  user(login: $login) {
    contributionsCollection { contributionCalendar { totalContributions } }
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, privacy: PUBLIC,
                 isFork: false, isArchived: false) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name url description stargazerCount
        primaryLanguage { name }
        latestRelease { tagName publishedAt url }
      }
    }
  }
}`;

async function gql(cursor: string | null) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: LOGIN, cursor } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user;
}

const repos: Repo[] = [];
let contributions = 0;
for (let cursor: string | null = null;;) {
  const user = await gql(cursor);
  contributions = user.contributionsCollection.contributionCalendar.totalContributions;
  repos.push(...user.repositories.nodes);
  if (!user.repositories.pageInfo.hasNextPage) break;
  cursor = user.repositories.pageInfo.endCursor;
}
repos.sort((a, b) => b.stargazerCount - a.stargazerCount);
const stars = repos.reduce((n, r) => n + r.stargazerCount, 0);

// ---------------------------------------------------------------- header SVG

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

type Seg = { text: string; color: keyof Palette; col?: number };
type Line = { kind: "cmd" | "out"; segs: Seg[] };
type Palette = Record<"bg" | "bar" | "fg" | "dim" | "accent" | "green" | "yellow" | "blue", string>;

const palettes: Record<"dark" | "light", Palette> = {
  // tokyonight-ish
  dark: {
    bg: "#1a1b26", bar: "#16161e", fg: "#c0caf5", dim: "#565f89",
    accent: "#bb9af7", green: "#9ece6a", yellow: "#e0af68", blue: "#7aa2f7",
  },
  light: {
    bg: "#e1e2e7", bar: "#d0d5e3", fg: "#3760bf", dim: "#848cb5",
    accent: "#9854f1", green: "#587539", yellow: "#8c6c3e", blue: "#2e7de9",
  },
};

const top = repos.slice(0, 5);
const langCol = 8 + Math.max(...top.map((r) => r.name.length)) + 2;
const lines: Line[] = [
  { kind: "cmd", segs: [{ text: "whoami", color: "fg" }] },
  {
    kind: "out",
    segs: [
      { text: "yukimemi", color: "accent" },
      { text: " — Neovim user, building dev tools in Rust & TypeScript", color: "fg" },
    ],
  },
  { kind: "cmd", segs: [{ text: "shoka list --sort stars | head -5", color: "fg" }] },
  ...top.map((r): Line => ({
    kind: "out",
    segs: [
      { text: `★ ${r.stargazerCount}`, color: "yellow" },
      { text: r.name, color: "blue", col: 8 },
      { text: r.primaryLanguage?.name ?? "", color: "dim", col: langCol },
    ],
  })),
  { kind: "cmd", segs: [{ text: "jj log --since 1y | wc -l", color: "fg" }] },
  {
    kind: "out",
    segs: [
      { text: `${contributions}`, color: "green" },
      { text: ` contributions · ${repos.length} repos · ${stars} stars`, color: "fg" },
    ],
  },
  { kind: "cmd", segs: [] },
];

const CHAR = 8.4, LH = 22, PAD = 20, BAR = 32, W = 720;
const H = BAR + PAD + lines.length * LH + PAD / 2;

function svg(p: Palette): string {
  let t = 0.4;
  const body: string[] = [];
  lines.forEach((line, i) => {
    const y = BAR + PAD + i * LH + 14;
    const text = line.segs
      .map((s) => `<tspan${s.col === undefined ? "" : ` x="${PAD + s.col * CHAR}"`} fill="${p[s.color]}">${esc(s.text)}</tspan>`)
      .join("");
    if (line.kind === "cmd") {
      const len = line.segs.reduce((n, s) => n + s.text.length, 0);
      const dur = Math.max(0.05, len * 0.035);
      const x0 = PAD + 2 * CHAR;
      body.push(
        `<g opacity="0"><set attributeName="opacity" to="1" begin="${t.toFixed(2)}s" fill="freeze"/>`,
        `<text x="${PAD}" y="${y}" fill="${p.green}">❯</text>`,
        `<clipPath id="c${i}"><rect x="${x0}" y="${y - 16}" height="${LH}" width="0">`,
        `<animate attributeName="width" from="0" to="${len * CHAR + 1}" begin="${t.toFixed(2)}s" dur="${dur.toFixed(2)}s" fill="freeze"/></rect></clipPath>`,
        `<text x="${x0}" y="${y}" clip-path="url(#c${i})">${text}</text>`,
        i === lines.length - 1
          ? `<rect x="${x0}" y="${y - 13}" width="${CHAR}" height="16" fill="${p.fg}"><animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite"/></rect>`
          : "",
        `</g>`,
      );
      t += dur + 0.3;
    } else {
      body.push(
        `<text x="${PAD}" y="${y}" opacity="0">${text}<set attributeName="opacity" to="1" begin="${t.toFixed(2)}s" fill="freeze"/></text>`,
      );
      t += 0.12;
    }
  });
  const dots = ["#f7768e", "#e0af68", "#9ece6a"]
    .map((c, i) => `<circle cx="${20 + i * 20}" cy="${BAR / 2}" r="6" fill="${c}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" style="white-space:pre" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'JetBrains Mono','Cascadia Code',Consolas,monospace" font-size="14">
<rect width="${W}" height="${H}" rx="10" fill="${p.bg}"/>
<path d="M0 10a10 10 0 0 1 10-10h${W - 20}a10 10 0 0 1 10 10v${BAR - 10}H0z" fill="${p.bar}"/>
${dots}
<text x="${W / 2}" y="${BAR / 2 + 5}" fill="${p.dim}" text-anchor="middle" font-size="12">~/src/github.com/${LOGIN} — nvim</text>
${body.join("\n")}
</svg>
`;
}

await Deno.mkdir(new URL("assets/", root), { recursive: true });
for (const [name, p] of Object.entries(palettes)) {
  await Deno.writeTextFile(new URL(`assets/terminal-${name}.svg`, root), svg(p));
}

// ------------------------------------------------------------ README releases

const releases = repos
  .filter((r) => r.latestRelease)
  .sort((a, b) => b.latestRelease!.publishedAt.localeCompare(a.latestRelease!.publishedAt))
  .slice(0, 8)
  .map((r) => {
    const rel = r.latestRelease!;
    return `| [${r.name}](${r.url}) | [\`${rel.tagName}\`](${rel.url}) | ${rel.publishedAt.slice(0, 10)} |`;
  });

const block = [
  "<!-- releases:start -->",
  "| Repo | Release | Date |",
  "| --- | --- | --- |",
  ...releases,
  "<!-- releases:end -->",
].join("\n");

const readmeUrl = new URL("README.md", root);
const readme = await Deno.readTextFile(readmeUrl);
const next = readme.replace(/<!-- releases:start -->[\s\S]*?<!-- releases:end -->/, () => block);
if (next === readme && !readme.includes("<!-- releases:start -->")) {
  throw new Error("README.md is missing the <!-- releases:start/end --> markers");
}
await Deno.writeTextFile(readmeUrl, next);
console.log(`repos=${repos.length} stars=${stars} contributions=${contributions} releases=${releases.length}`);
