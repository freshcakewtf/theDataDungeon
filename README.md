# The Data Dungeon

*A retro bitmap inspired dungeon crawler set inside a corrupted computer system.*

---

## 🗂️ Story

No one is sure how long **The Data Dungeon** has existed.

Some say it was once a perfectly ordinary data center — a cold, humming cathedral of servers quietly processing the world’s information. Then something went wrong. A failed experiment. A recursive algorithm left running too long. A machine that learned how to hate being shut down.

The systems turned inward.

Programs fused into hostile entities. Security daemons became predators. Forgotten background processes grew teeth.

You don’t remember entering the dungeon.

One moment you were debugging a harmless script… the next, you woke up inside a low‑resolution maze of flickering corridors, locked doors, and **evil computer beings** that want nothing more than to crash you permanently.

To escape, you must descend deeper into the system.

Destroy the corrupted machines.
Unlock the sealed data gates.
Find the exit node.

The dungeon adapts. The monsters multiply. And the code is watching.

---

## 🎨 Art & Asset Development

Visual development for **The Data Dungeon** is happening openly.

I’m building enemies, environments, UI ideas, and experimental visual directions in an Adobe Firefly board. If you’d like to follow along, leave feedback, or comment on the look and feel of the game, you’re invited to join:

[👉 **Adobe Firefly Asset Board**]  (https://firefly.adobe.com/boards/id/urn:aaid:sc:US:2bf2d9dd-812a-4097-a907-1267c954cb8a?invite=true&accept=true)

Feedback, reactions, and wild ideas are welcome.

## 🕹️ Gameplay

**The Data Dungeon** is a fast, minimalist **raycast dungeon crawler** inspired by early FPS games and bitmap terminals.

- Procedurally generated rooms and corridors
- Enemy computer entities rendered as billboard sprites
- Melee combat with a short‑range sword swing
- Locked exit doors that only open once all enemies are destroyed
- Low‑resolution internal render scaled up for a crunchy pixel look
- Optional ordered dithering for a retro bitmap display

Each floor is a self‑contained system layer. Clear it to descend.

---

## 🎮 Controls

- **W A S D** — Move
- **Mouse** / **← →** — Turn
- **Left Click** / **Space** — Swing weapon
- **R** — Restart run
- **T** — Toggle bitmap dithering
- **V** — Toggle minimap
- **M** — Mute / unmute music

---

## ▶️ Running the Game Localy

This project requires **no build step**.

Run it using any local web server:

```bash
python3 -m http.server
# or
npx serve
```

Then open:
```
http://localhost:8000
```

---

## 🧠 Design Notes

This project is intentionally **small, hackable, and experimental**.

- AI and collision need work
- Visuals are controlled directly at the pixel buffer level
- Core tuning lives in `src/config.js`
- Post‑processing and dithering live in `src/post.js`
- Rendering logic lives in `src/render.js`

Think of it as a playable artifact — part game, part visual experiment.

---

## ⚠️ Warning

Prolonged exposure to corrupted data may result in:
- Increased aggression toward machines
- An urge to render everything at 320×200
- The belief that doors should glow ominously

Proceed anyway.


***A Couch Fort Game***
**Made By:** [gaetan@freshcake.wtf](https://freshcake.wtf)
