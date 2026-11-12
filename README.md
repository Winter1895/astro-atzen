# Astro Atzen

Party-Spiel für 2–8 Leute: Jeder rennt mit seinem Atzen über einen kleinen Planeten und zieht eine Linie hinter sich her, die die ganze Runde liegen bleibt. Wer in eine Linie läuft (auch in die eigene), ist raus. Der Letzte holt den Punkt.

- **Joystick links**: lenken (der Atze läuft von allein)
- **JET** (rechts): hebt sofort auf die feste Flughöhe ab; halten = oben bleiben, loslassen = landen. Jeder Flug dauert mindestens 0,6 Sekunden. Linien liegen dadurch entweder am Boden oder auf Flughöhe – unter Flug-Linien läuft man durch, über Boden-Linien fliegt man drüber.
- **DASH** (rechts): kurzer Sprint mit Abklingzeit
- Am PC: A/D oder Pfeiltasten, Leertaste, Shift

Zehn Charaktere mit eigenem Körperbau und eigenen Werten – fünf davon mit Spezialfähigkeit (Geist, Rammbock, Brummer, Segler, Hering). Dazu Outfits, Muster, Frisuren, Hüte, Brillen, Bärte und Extras im Atzen-Editor.

Die Hintergrundmusik wird im Browser erzeugt (`public/js/audio.js`, Akkorde und Melodie stehen dort als Listen) – es gibt keine Musikdatei.

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

Wichtig: Die Region **Frankfurt** beim Anlegen auswählen – steht der Server in den USA, hat jeder über 100 ms Verzögerung. Die Zahl oben rechts im Spiel zeigt die aktuelle Verzögerung.

Hinweis zum Gratis-Tarif: Nach 15 Minuten ohne Besucher schläft der Server ein, der erste Aufruf danach dauert etwa eine Minute. Während gespielt wird, bleibt er wach.

## Konten + Rangliste

Im Startmenü kann sich jeder ein Konto anlegen (Name + Passwort, keine E-Mail). Für die Rangliste zählen nur Runden, die

- **ohne Bots** gespielt werden und
- mindestens **zwei echte Spieler** haben.

Server- und WLAN-Räume zählen beide. Bei WLAN-Räumen rechnet das Handy des Hosts und meldet das Ergebnis; der Server kann es nicht nachprüfen, ein Host könnte also schummeln.

Kill = jemand läuft in deine Linie. Tod = du bist raus, egal wodurch (auch eigene Linie oder Raum verlassen). Dasselbe Konto kann nicht zweimal im selben Raum sitzen. In die Platzierung kommt man ab 10 Runden.

**Damit die Daten erhalten bleiben, braucht der Server eine Datenbank.** Ohne sie speichert er in `data/db.json`, und die ist auf Render nach jedem Neustart leer. Einrichtung (kostenlos, einmalig):

1. Auf https://neon.com ein Konto anlegen und ein Projekt erstellen (Region Frankfurt).
2. Die „Connection string" kopieren (beginnt mit `postgresql://`).
3. Bei Render im Service unter **Environment** eine Variable `DATABASE_URL` mit diesem Wert anlegen und speichern. Render startet neu, die Tabellen legt der Server selbst an.

Im Render-Log steht danach `Speicher für Konten/Rangliste: postgres`.

## Zwei Arten von Räumen

- **Server-Raum**: Die Runde läuft auf dem Server. Funktioniert überall, die Verzögerung hängt vom Server ab.
- **WLAN-Raum hosten**: Die Runde läuft auf dem Handy des Hosts, alle anderen verbinden sich direkt mit ihm (WebRTC). Im selben WLAN sind das nur wenige Millisekunden. Der Server wird nur kurz für den Verbindungsaufbau gebraucht. Der Host muss das Spiel offen lassen; manche Netze (Uni-/Gäste-WLAN) blockieren Direktverbindungen – dann den Server-Raum nehmen.

Beitreten geht in beiden Fällen gleich: Code eingeben oder Link öffnen.

## Als App aufs Handy

Seite im Browser öffnen → Menü → **Zum Home-Bildschirm hinzufügen**. Danach startet das Spiel über das Icon im Vollbild (Android zusätzlich fest im Querformat).

## Aufbau

| Datei | Zweck |
|---|---|
| `server.js` | liefert `public/` aus und hostet die Räume per WebSocket (`/ws`) |
| `accounts.js`, `db.js` | Konten (Passwort-Hash, Anmelde-Token) und Speicher für die Rangliste (Postgres oder Datei) |
| `public/shared/sim.js` | Spielphysik, Bänder, Kollision, Bots – **alle Stellschrauben stehen oben in `C`** |
| `public/shared/room.js` | Lobby, Runden, Punkte (läuft auf dem Server und im Training im Browser) |
| `public/js/net.js` | Verbindungen: Server (WebSocket), Training (lokal), WLAN-Raum (Host/Mitspieler per WebRTC) |
| `public/js/netgame.js` | Client-Vorhersage + Interpolation |
| `public/js/render.js` | 3D-Darstellung (Three.js): Planet, Bänder, Kamera |
| `public/js/atze.js` | Atzen-Modell: Körperbau, Outfits, Muster, Frisuren, Extras (neue Teile hier ergänzen + Limit in `shared/room.js`) |
| `public/js/main.js` | Menüs, Atzen-Editor, HUD |
| `public/js/input.js`, `audio.js` | Touch-Steuerung, Soundeffekte |

Tests: `npm test` (Bots gegeneinander + Netzwerktest mit simulierter Latenz).
