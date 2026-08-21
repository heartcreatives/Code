# Heart Prints and Crafts — one-page site

Static, single-file landing page for **Heart Prints and Crafts**, a souvenir event cart
based in Tagum City. Open `index.html` in a browser — no build step, no dependencies.
Fonts (Bodoni Moda + Karla) load from Google Fonts; everything else is inline.

## What's on the page
Hero → services → about + why book with us → how booking works (3 steps) →
service area + contact → FAQ → footer, plus a sticky Call / WhatsApp bar on mobile.

Every CTA points at a real action: `tel:+639088658381`, `https://wa.me/639088658381`
with a pre-filled message, or the `#book` contact block.

## Details still missing
The page was written using only confirmed information, so nothing below was invented —
sections were kept simple instead. Fill these in before handing the site over:

| Item | Status |
|---|---|
| Tagline | not used |
| WhatsApp number | **currently reusing 0908 865 8381** — swap if it differs |
| Email address | omitted |
| Full address | omitted (no walk-in store; page says so) |
| Opening hours | omitted |
| Service / product list & prices | described only in general terms |
| Customer reviews | no testimonial section (none supplied — do not fake) |
| Photos of the cart and souvenirs | none yet; the hero uses a CSS gift-tag motif |
| Social links (Facebook / Instagram) | omitted |

## Brand tokens
Defined once at the top of `index.html` and re-declared for dark mode:
paper `#FBF6F2`, sand `#EFE4D9`, ink `#2C2226`, rose `#A83D63`, blush `#F7E4E9`.
