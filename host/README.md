# Datoteke na Proxmox hostu

Skripte in systemd enote, ki tečejo na Proxmox hostu (ne v CT 101). Dashboard z njimi komunicira prek map:

- `/var/lib/hcc-host` → CT 101 `/srv/hcc-host` (read-only, mp0): `hcc-host-status` vsakih 30 s zapiše `status.json`
  (CPU temperature, pokvarjene enote, posodobitve).
- `/var/lib/hcc-control` → CT 101 `/srv/hcc-control` (mp1, lastnik 100000:100000): dashboard zapiše `request.json`
  ali `schedule.json`, host odgovori v `result.json` in `power.json`.

| Datoteka | Namesto | Kaj dela |
|---|---|---|
| `hcc-host-status` + `.service`/`.timer` | `/usr/local/bin`, `/etc/systemd/system` | stanje hosta za dashboard |
| `hcc-tank-control` | `/usr/local/bin` | varen izklop/vklop ZFS bazena `tank` (ustavi CT 103/104, `zpool export`/`import`) |
| `hcc-power` | `/usr/local/bin` | izklop/ponovni zagon strežnika, urnik delovanja z RTC budilko za vklop |
| `hcc-tank-control.path`/`.service` | `/etc/systemd/system` | ob novi zahtevi zažene `hcc-tank-control` in `hcc-power` |
| `hcc-power-schedule.service`/`.timer` | `/etc/systemd/system` | vsako minuto preveri urnik izklopa |

Namestitev: kopiraj datoteke na mesta iz tabele, `systemctl daemon-reload`, nato
`systemctl enable --now hcc-host-status.timer hcc-tank-control.path hcc-power-schedule.timer`.
