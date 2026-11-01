import https from "node:https";

const PVE_URL = process.env.PVE_API_URL; // npr. https://192.168.1.10:8006
const PVE_TOKEN_ID = process.env.PVE_TOKEN_ID; // npr. hcc@pve!dashboard
const PVE_TOKEN_SECRET = process.env.PVE_TOKEN_SECRET;
const PVE_INSECURE_TLS = process.env.PVE_INSECURE_TLS === "1";

// Proxmox uporablja samopodpisan certifikat, zato ga po izbiri ne preverjamo.
// To velja samo za ta agent, ne za ostale zahteve aplikacije.
const pveAgent = new https.Agent({ rejectUnauthorized: !PVE_INSECURE_TLS });

export function pveGet<T>(path: string): Promise<T> {
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

export const pveConfigured = Boolean(PVE_URL && PVE_TOKEN_ID && PVE_TOKEN_SECRET);

// Ime Proxmox vozlišča (single-node namestitev).
export const PVE_NODE = process.env.PVE_NODE ?? "pve";
