import https from "node:https";

export type GuestKind = "node" | "lxc" | "qemu" | "docker";

export type NetworkItem = {
  id: string;
  name: string;
  kind: GuestKind;
  status: string;
  ips: string[];
  ports: string[];
  host?: string;
  uptime?: number;
  cpu?: number;
  memUsed?: number;
  memMax?: number;
};

export type NetworkOverview = {
  items: NetworkItem[];
  errors: string[];
  generatedAt: string;
};

/* ---------------- Proxmox ---------------- */

const PVE_URL = process.env.PVE_API_URL; // npr. https://192.168.1.10:8006
const PVE_TOKEN_ID = process.env.PVE_TOKEN_ID; // npr. hcc@pve!dashboard
const PVE_TOKEN_SECRET = process.env.PVE_TOKEN_SECRET;
const PVE_INSECURE_TLS = process.env.PVE_INSECURE_TLS === "1";

// Proxmox uporablja samopodpisan certifikat, zato ga po izbiri ne preverjamo.
// To velja samo za ta agent, ne za ostale zahteve aplikacije.
const pveAgent = new https.Agent({ rejectUnauthorized: !PVE_INSECURE_TLS });

function pveGet<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api2/json${path}`, PVE_URL);
    const req = https.request(
      url,
      {
        method: "GET",
        agent: pveAgent,
        timeout: 5000,
        headers: { Authorization: `PVEAPIToken=${PVE_TOKEN_ID}=${PVE_TOKEN_SECRET}` },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`Proxmox ${path}: HTTP ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body).data as T);
          } catch {
            reject(new Error(`Proxmox ${path}: neveljaven odgovor`));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`Proxmox ${path}: timeout`)));
    req.on("error", reject);
    req.end();
  });
}

type PveResource = {
  id: string;
  type: "node" | "lxc" | "qemu" | string;
  vmid?: number;
  name?: string;
  node: string;
  status: string;
  uptime?: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  template?: number;
};

type PveInterface = { name: string; inet?: string; "ip-addresses"?: { "ip-address": string; "ip-address-type": string }[] };

const stripCidr = (ip: string) => ip.split("/")[0];
const isUsefulIp = (ip: string) => !ip.startsWith("127.") && ip !== "::1" && !ip.toLowerCase().startsWith("fe80");

// Statični IP iz konfiguracije (net0: ...,ip=192.168.1.50/24,...) - deluje tudi, ko je gost ugasnjen.
function ipsFromConfig(config: Record<string, unknown>): string[] {
  return Object.entries(config)
    .filter(([key]) => /^net\d+$/.test(key))
    .flatMap(([, value]) => {
      const match = /(?:^|,)ip=([^,]+)/.exec(String(value));
      return match && match[1] !== "dhcp" && match[1] !== "manual" ? [stripCidr(match[1])] : [];
    });
}

async function guestIps(r: PveResource): Promise<string[]> {
  const base = `/nodes/${r.node}/${r.type}/${r.vmid}`;
  try {
    if (r.type === "lxc" && r.status === "running") {
      const ifaces = await pveGet<PveInterface[]>(`${base}/interfaces`);
      const ips = ifaces.filter((i) => i.name !== "lo" && i.inet).map((i) => stripCidr(i.inet!));
      if (ips.length) return ips;
    }
    if (r.type === "qemu" && r.status === "running") {
      // Zahteva qemu-guest-agent v VM-ju; če ga ni, uporabimo konfiguracijo.
      const res = await pveGet<{ result: PveInterface[] }>(`${base}/agent/network-get-interfaces`);
      const ips = res.result
        .flatMap((i) => i["ip-addresses"] ?? [])
        .filter((a) => a["ip-address-type"] === "ipv4")
        .map((a) => a["ip-address"])
        .filter(isUsefulIp);
      if (ips.length) return ips;
    }
  } catch {
    // padec na konfiguracijo spodaj
  }
  try {
    return ipsFromConfig(await pveGet<Record<string, unknown>>(`${base}/config`));
  } catch {
    return [];
  }
}

async function nodeIps(node: string): Promise<string[]> {
  try {
    const nets = await pveGet<{ iface: string; address?: string; type: string }[]>(`/nodes/${node}/network`);
    return nets.filter((n) => n.address && n.type === "bridge").map((n) => n.address!);
  } catch {
    return [];
  }
}

async function proxmoxItems(): Promise<NetworkItem[]> {
  const resources = await pveGet<PveResource[]>("/cluster/resources");
  const relevant = resources.filter(
    (r) => (r.type === "node" || r.type === "lxc" || r.type === "qemu") && !r.template
  );

  return Promise.all(
    relevant.map(async (r): Promise<NetworkItem> => {
      const isNode = r.type === "node";
      return {
        id: r.id,
        name: isNode ? r.node : `${r.vmid} · ${r.name ?? "brez imena"}`,
        kind: r.type as GuestKind,
        status: r.status,
        ips: isNode ? await nodeIps(r.node) : await guestIps(r),
        ports: [],
        host: isNode ? undefined : r.node,
        uptime: r.uptime,
        cpu: r.cpu,
        memUsed: r.mem,
        memMax: r.maxmem,
      };
    })
  );
}

/* ---------------- Docker ---------------- */

// Dostop prek docker-socket-proxy (samo branje seznama kontejnerjev).
const DOCKER_API = process.env.DOCKER_API_URL; // npr. http://docker-proxy:2375
const DOCKER_HOST_IP = process.env.DOCKER_HOST_IP; // IP LXC kontejnerja, v katerem teče Docker

type DockerContainer = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports: { IP?: string; PrivatePort: number; PublicPort?: number; Type: string }[];
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
};

async function dockerItems(): Promise<NetworkItem[]> {
  const res = await fetch(`${DOCKER_API}/containers/json?all=1`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Docker: HTTP ${res.status}`);
  const containers = (await res.json()) as DockerContainer[];

  return containers.map((c) => {
    const published = c.Ports.filter((p) => p.PublicPort && (!p.IP || p.IP === "0.0.0.0"));
    const ports = [...new Set(published.map((p) => `${p.PublicPort}→${p.PrivatePort}/${p.Type}`))];
    const internalIps = Object.values(c.NetworkSettings?.Networks ?? {})
      .map((n) => n.IPAddress)
      .filter((ip): ip is string => Boolean(ip));
    return {
      id: `docker/${c.Id.slice(0, 12)}`,
      name: c.Names[0]?.replace(/^\//, "") ?? c.Id.slice(0, 12),
      kind: "docker",
      status: c.State,
      ips: published.length && DOCKER_HOST_IP ? [DOCKER_HOST_IP] : internalIps,
      ports,
      host: c.Image,
    };
  });
}

/* ---------------- Skupaj ---------------- */

export async function getNetworkOverview(): Promise<NetworkOverview> {
  const errors: string[] = [];
  const items: NetworkItem[] = [];

  const tasks: Promise<void>[] = [];
  if (PVE_URL && PVE_TOKEN_ID && PVE_TOKEN_SECRET) {
    tasks.push(
      proxmoxItems()
        .then((r) => void items.push(...r))
        .catch((e: Error) => void errors.push(e.message))
    );
  } else {
    errors.push("Proxmox ni nastavljen (PVE_API_URL, PVE_TOKEN_ID, PVE_TOKEN_SECRET).");
  }
  if (DOCKER_API) {
    tasks.push(
      dockerItems()
        .then((r) => void items.push(...r))
        .catch((e: Error) => void errors.push(e.message))
    );
  }
  await Promise.all(tasks);

  const order: Record<GuestKind, number> = { node: 0, lxc: 1, qemu: 2, docker: 3 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name, "sl", { numeric: true }));

  return { items, errors, generatedAt: new Date().toISOString() };
}
