# Vklop / izklop računalnika z dashboarda

V glavi dashboarda je gumb z imenom računalnika in stanjem (prižgan/ugasnjen). Klik odpre meni:

- **Prižgi** - Wake-on-LAN magic packet na `PC_MAC`
- **Spanje** / **Izklopi** - SSH na `PC_HOST` z omejenim ključem (potrditev v oknu)

Stanje se ugotavlja z odzivom SSH porta (22) na `PC_HOST`.

## 1. Računalnik (Linux Mint)

WoL na žični kartici (enkrat):

```bash
sudo nmcli connection modify "Wired connection 1" 802-3-ethernet.wake-on-lan magic
sudo ethtool eno1 | grep Wake-on   # mora biti: Wake-on: g
```

SSH strežnik in skripta, ki dovoli samo izklop in spanje:

```bash
sudo apt install openssh-server

sudo tee /usr/local/bin/hcc-power >/dev/null <<'EOF'
#!/bin/sh
# Ukazi z dashboarda (SSH ključ je omejen na to skripto).
case "$SSH_ORIGINAL_COMMAND" in
  poweroff) exec sudo /usr/bin/systemctl poweroff ;;
  suspend)  exec sudo /usr/bin/systemctl suspend ;;
  *) echo "nedovoljen ukaz" >&2; exit 1 ;;
esac
EOF
sudo chmod 755 /usr/local/bin/hcc-power

echo "$USER ALL=(root) NOPASSWD: /usr/bin/systemctl poweroff, /usr/bin/systemctl suspend" \
  | sudo tee /etc/sudoers.d/hcc-power
sudo chmod 440 /etc/sudoers.d/hcc-power
sudo visudo -c
```

Računalniku na routerju nastavi **DHCP rezervacijo** (fiksni IP) za MAC `00:68:eb:d5:d4:53`.

## 2. Dashboard (LXC z Dockerjem, mapa projekta)

```bash
mkdir -p secrets
ssh-keygen -t ed25519 -N "" -C hcc-dashboard -f secrets/pc_key
cat secrets/pc_key.pub
```

Na računalniku dodaj to vrstico v `~/.ssh/authorized_keys` (javni ključ prilepi namesto `ssh-ed25519 AAAA...`):

```
command="/usr/local/bin/hcc-power",restrict ssh-ed25519 AAAA... hcc-dashboard
```

V `.env` dodaj:

```
PC_NAME=Prenosnik
PC_MAC=00:68:eb:d5:d4:53
PC_HOST=192.168.1.xx
PC_SSH_USER=peroz
```

Nato `docker compose up -d --build`.

## Opombe

- Kontejner teče z `network_mode: host`, ker broadcast iz Dockerjevega bridge omrežja ne pride v domače omrežje.
  Aplikacija posluša na portu 3003 kot prej, zato reverse proxy (Caddy) ostane nespremenjen.
- Prenosnik se iz izklopa zbudi samo na polnilcu in z vgrajenim Ethernet priključkom. Če iz izklopa ne dela,
  uporabi **Spanje** - iz spanja WoL deluje zanesljivo.
- Dashboard nima prijave: kdorkoli v domačem omrežju lahko računalnik ugasne. Ključ zna samo izklop/spanje.
