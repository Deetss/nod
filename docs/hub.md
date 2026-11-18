# Hub and spokes

A hub is one always-on Linux machine that runs Nod as a service. Your phone pairs to the hub, so it keeps working while your desktop is off or asleep. Desktops are spokes: each one runs the Nod app, and with a Hub URL set it shows the hub instead of starting its own server.

## Pick a setup

| Setup | Phone works when the desktop is off | Machines |
|---|---|---|
| Solo | No | One desktop |
| Hub | Yes | One always-on box, plus any desktops |
| Hub with Orca | Yes, and the phone can dispatch agents | Hub runs Orca too |

### Solo

The desktop app runs its own server. A phone pairs to the desktop and loses Nod when it sleeps.

```mermaid
flowchart LR
  GH[(GitHub)]
  Phone[Phone]
  subgraph Desktop
    App[Nod app<br/>own server]
    Orca[Orca<br/>optional]
  end
  App -- gh sync --> GH
  App -. orca-ide .-> Orca
  Phone -- Tailscale Serve 443 --> App
```

### Hub

The hub syncs with GitHub, keeps the inbox state and sends Web Push. The phone, paired desktops and any paired browser reach it over Tailscale Serve, each with its own device key. A desktop with a Hub URL shows the hub's inbox, seen marks and settings. A desktop without one keeps its own server, seen marks and settings.

```mermaid
flowchart LR
  GH[(GitHub)]
  Phone[Phone]
  subgraph Hub[Hub, always on]
    TS[Tailscale Serve 443]
    Svc[nod serve<br/>systemd user service]
  end
  subgraph Spoke[Desktop]
    App[Nod app<br/>Hub URL set]
  end
  Phone -- device key --> TS
  App -- device key --> TS
  TS --> Svc
  Svc -- gh sync --> GH
```

### Hub with Orca

Orca actions run on the machine whose Nod server makes the call. Install Orca on the hub to see session chips and dispatch agents from the phone. Orca on a desktop serves only that desktop's app.

```mermaid
flowchart LR
  GH[(GitHub)]
  Phone[Phone]
  subgraph Hub[Hub, always on]
    TS[Tailscale Serve 443]
    Svc[nod serve]
    OrcaH[Orca on the hub]
  end
  subgraph Spoke[Desktop]
    App[Nod app<br/>own server]
    OrcaD[Orca on the desktop]
  end
  Phone -- device key --> TS --> Svc
  Svc -- gh sync --> GH
  Svc -- orca-ide --> OrcaH
  App -- gh sync --> GH
  App -- orca-ide --> OrcaD
```

| Orca installed on | Phone sees sessions and dispatches | Desktop app sees sessions and dispatches |
|---|---|---|
| Hub only | Yes, on the hub | No |
| Desktop only | No | Yes, on the desktop |
| Both | Hub sessions | Desktop sessions |
| Neither | No Orca features | No Orca features |

## Set up the hub

Run these on the hub, from a checkout of this repo.

1. Log in to GitHub with the scopes Nod uses: `gh auth login -h github.com -s repo,read:org,project`.
2. Check the machine: `scripts/setup-hub.sh --check`. It checks the `gh` login and scopes, Tailscale, FUSE 2 and systemd linger, and prints a command for anything missing. It never runs `sudo`.
3. Copy your desktop settings, so the hub watches the same orgs: `scripts/setup-hub.sh --settings <path to app-settings.json>`. The desktop keeps them in `~/.config/nod/app-settings.json`. Skip `--settings` to keep the hub's own.
4. Without `--check`, the script downloads the latest release, installs the service, adds a headless drop-in when the box has no display, starts the service, and serves it on port 443 with Tailscale Serve. It stops rather than replace another site already on 443.
5. It prints the hub URL. `scripts/setup-hub.sh --pair` prints a one-time pairing link, good for 10 minutes.

Rerunning the script is safe. The service updates itself from releases after that.

## Device roles

Every paired device has a role, chosen when its pairing code is made.

| Role | Made with | May |
|---|---|---|
| `phone` | `nod pair`, Pair phone, `scripts/setup-hub.sh --pair` | Use the inbox |
| `desktop` | `nod pair --desktop` | Use the inbox; Orca hosts read only |
| `admin` | `nod pair --admin` | Also list, rename and revoke devices, make pairing codes and save settings |

`nod pair` runs on the hub. It asks the local service for a code with the role its flag names, and prints the link, a QR code and when it expires. A desktop code's first line says to paste the link in Settings > Hub. The session token is never printed. See [Service](phone.md#service).


## Use the hub from a desktop

1. On the hub, run `nod pair --admin` (or `--desktop`). Copy the link it prints.
2. On the desktop, open Settings > Hub, type the hub address (`https://hub.example.ts.net`) and press Check. Nod asks once to confirm the hub. The pill reads `Reachable · not paired`.
3. Click Pair this desktop, paste the link (or only the code) and press Pair. A small window opens the hub's pair page in the desktop's own browser session, so the device cookie lands where the main window reads it. When the hub reports this desktop's role, Nod asks to open the hub in the window.
4. From then on the desktop opens the hub at start. It starts no server of its own.

If the hub does not answer at start, or this desktop is not paired, the desktop starts its own server as before and logs one `[hub]` line. To change or clear the Hub URL while the window shows the hub, start Nod once with `nod --local`.

Desktop notifications come from the hub's event stream and follow the same rules as before. See [Notifications](notifications.md).

## Move a phone to the hub

1. Run `scripts/setup-hub.sh --pair` on the hub.
2. Open the link on the phone, or enter the hub address in the app's setup screen and paste the code.

## Turn a desktop into a spoke

A desktop that used to host the phone should stop, so only the hub answers on the tailnet.

1. `systemctl --user disable --now nod`
2. `tailscale serve --https=443 off`, and the same for `8443` if you served it.
3. Quit the app (`Ctrl+Q`) and open it again. It starts its own server.
4. To use the hub from this desktop, follow [Use the hub from a desktop](#use-the-hub-from-a-desktop).

## Not yet

- A desktop that falls back to its own server shows no banner, and its seen marks are not sent to the hub when it comes back.
- Seen marks and settings on a desktop without a Hub URL stay separate from the hub's.

- The hub cannot run Orca actions on another machine.
