// Povezave na web vmesnike v Network oknu.
// Ključ je ime v Proxmoxu (vozlišče ali gost) ali ime Docker kontejnerja.
// Imena *.home kaže AdGuard na reverse proxy (CT 106, Caddy), ki skrbi za HTTPS.
// Brez vnosa: Proxmox vozlišče dobi https://<ip>:8006, Docker kontejner pa
// http://<DOCKER_HOST_IP>:<prvi objavljeni port>; LXC/VM gostje brez vnosa nimajo povezave.
export const webLinks: Record<string, string> = {
  pve: "https://proxmox.home/",
  adguard: "https://adguard.home/",
  nas: "https://nas.home/storage/",
  jellyfin: "https://jellyfin.home/",
  proxy: "http://ca.home/",
  "household-command-center-app-1": "https://dashboard.home/",
};
