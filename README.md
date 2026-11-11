# Astro Atzen

Party-Spiel für 2–8 Leute: Jeder rennt mit seinem Atzen über einen kleinen Planeten und zieht eine Linie hinter sich her, die die ganze Runde liegen bleibt. Wer in eine Linie läuft (auch in die eigene), ist raus. Der Letzte holt den Punkt.

- **Joystick links**: lenken (der Atze läuft von allein)
- **JET** (rechts): tippen = Sprung, halten = Jetpack schweben, solange der Tank reicht
- **DASH** (rechts): kurzer Sprint, 3 Sekunden Abklingzeit
- Am PC: A/D oder Pfeiltasten, Leertaste, Shift

## Lokal starten

```bash
npm install
npm start
```

Dann http://localhost:3000 öffnen. Handys im selben WLAN erreichen das Spiel über `http://<IP-deines-Rechners>:3000`.

## Online stellen (kostenlos, Render)

1. Diesen Ordner in ein GitHub-Repo pushen.
2. Auf https://render.com mit GitHub anmelden → **New → Web Service** → Repo auswählen.
3. Einstellungen: Region **Frankfurt**, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**.
4. Nach dem Deploy gibt es eine Adresse wie `https://astro-atzen.onrender.com` – die schickst du deinen Freunden.

Hinweis zum Gratis-Tarif: Nach 15 Minuten ohne Besucher schläft der Server ein, der erste Aufruf danach dauert etwa eine Minute. Während gespielt wird, bleibt er wach.

## Als App aufs Handy

Seite im Browser öffnen → Menü → **Zum Home-Bildschirm hinzufügen**. Danach startet das Spiel über das Icon im Vollbild (Android zusätzlich fest im Querformat).

## Aufbau

| Datei | Zweck |
|---|---|
| `server.js` | liefert `public/` aus und hostet die Räume per WebSocket (`/ws`) |
| `public/shared/sim.js` | Spielphysik, Bänder, Kollision, Bots – **alle Stellschrauben stehen oben in `C`** |
| `public/shared/room.js` | Lobby, Runden, Punkte (läuft auf dem Server und im Training im Browser) |
| `public/js/netgame.js` | Client-Vorhersage + Interpolation |
| `public/js/render.js` | 3D-Darstellung (Three.js): Planet, Bänder, Kamera |
| `public/js/atze.js` | Atzen-Modell: Farben, Frisuren, Gesichter |
| `public/js/main.js` | Menüs, Atzen-Editor, HUD |
| `public/js/input.js`, `audio.js` | Touch-Steuerung, Soundeffekte |

Tests: `npm test` (Bots gegeneinander + Netzwerktest mit simulierter Latenz).
