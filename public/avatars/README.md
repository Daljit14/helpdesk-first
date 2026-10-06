# Avatars (3C Clay)

16 fictional clay-style characters, AI-generated for HelpDesk First. They do not depict real people.

- `<id>-96.webp`, `<id>-256.webp`: static portrait (the idle "base" frame). This is the fallback whenever animation is off, reduced motion is on, or the sprite fails to load.
- `anim/<id>.webp`: animation keyframe sheet, 7 frames of 192x192 laid out left to right in this order:
  `base, blink, lift, raise, wave-a, wave-b, inhale`.
  Every frame shares the same camera, crop and lighting. Only the eyes, arm/hand, smile or shoulders change between frames.
  The runtime (`components/avatar/clay-timeline.ts`) sequences them: breathing (base and inhale), blinks every 3–5 s, and a wave (lift, raise, then wave-a and wave-b twice, then back down) every 8–12 s.

The IDs and captions are defined in `components/avatar/portraits.ts`.
