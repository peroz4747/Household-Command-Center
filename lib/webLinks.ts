// Web vmesniki Proxmox gostov (LXC/VM), ki jih ni mogoče samodejno zaznati.
// Ključ je ime gosta v Proxmoxu. {ip} se zamenja s prvim IP-jem gosta.
// Proxmox host in Docker kontejnerji z objavljenimi porti se zaznajo samodejno.
export const guestWebLinks: Record<string, string> = {
  adguard: "http://{ip}/",
  nas: "http://{ip}/storage",
  jellyfin: "http://{ip}:8096/",
};
