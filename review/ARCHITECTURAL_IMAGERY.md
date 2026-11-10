# Architectural imagery update

Prepared for review on `update/architectural-imagery`, based on production commit `c89432bc736e4210b457f49881b56c903329b243`. Approved for publication with the normal freestanding safe in the third homepage service card.

## Changes

Replaced all 12 flat service illustrations: three homepage service cards, four page-hero drawings (safe installation, process, FAQ, standards), and five faint background drawings in editorial panels (vault rooms, vault doors, safe installation, process, service area). The original architectural hero image, branding, functional icons, and geographic map remain. No account, document viewer, inquiry, or backend behavior was changed.

Three matching concepts were generated using the built-in image generator, with `assets/hero-vault.webp` as the style reference. Each is clearly captioned as an architectural concept illustration. The application uses local WebP images, responsive 768-pixel variants, lazy loading below the fold, descriptive alternative text for content images, and decorative empty alternatives behind text. Dark overlays preserve text readability. Removed the unused code-drawn illustration stylesheet.

## Asset paths

- `assets/concept-room.webp` and `assets/concept-room-768.webp`
- `assets/concept-door.webp` and `assets/concept-door-768.webp`
- `assets/concept-safe.webp` and `assets/concept-safe-768.webp`

## Validation

- `python tests/check-site.py`: 13 HTML pages, 9 JavaScript files, no errors; builds successfully.
- `git diff --check`: passed.
- Browser checked all eight changed HTML pages: no horizontal overflow, no visible broken images, and no remaining flat service drawing elements.
- Visually checked desktop service cards, safe-installation hero, and a photo-backed text panel.
- Checked the service cards and safe-installation page inside a 390-pixel mobile frame (375-pixel content viewport): no horizontal overflow; all three card images loaded their small variants.
- No new automated tests were added for this image-only change. Existing structural/build checks were used; application JavaScript is unchanged.
- Preview-only mobile harness is excluded from the final build and source commit.

## Exact generation prompts

### room

Use case: ads-marketing. Asset type: Northwoods Vault & Safe website architectural concept imagery. Create one new independent landscape image, approximately 3:2, using the provided image only as a STYLE REFERENCE for photoreal architectural rendering, materials, color grade, soft natural daylight and warm interior lighting. Do not copy its exact scene or add typography. Scene: A finished residential vault room interior, seen from just outside its open substantial graphite steel vault door. The room itself is the main subject: warm walnut cabinetry, illuminated organized shelves with a few document boxes and valuables storage, small central work surface, stone tile floor, natural timber ceiling details. Spacious but believable residential proportions, calm and uncluttered. The open vault door is visible along one edge and not blocking the interior. No weapons or people. Premium realistic architectural visualization with straight verticals, correct perspective, tactile natural materials, softly lit shadows, graphite steel, warm timber, muted stone and forest accents. Camera at eye level, 35mm lens, avoid fisheye. Frame the subject so it remains recognizable when cropped to a wide 1.85:1 service card, keeping key features inside the central 75% of the height. This is a concept illustration, not a photograph of a completed client project. No text, no labels, no watermark, no split panels, no icons, no flat vector look.

### door

Use case: ads-marketing. Asset type: Northwoods Vault & Safe website architectural concept imagery. Create one new independent landscape image, approximately 3:2, using the provided image only as a STYLE REFERENCE for photoreal architectural rendering, materials, color grade, soft natural daylight and warm interior lighting. Do not copy its exact scene or add typography. Scene: A substantial closed graphite steel residential vault door professionally fitted into a natural stone interior wall with warm timber trim. One consistent, believable brushed-steel three-spoke handle and a discreet mechanical lock, real thick steel frame and hinges. Door is the main subject, full door visible with room above and below, a small portion of the warm timber and stone hallway on each side. Minimal nearby furnishing, refined and uncluttered. No people. Premium realistic architectural visualization with straight verticals, correct perspective, tactile natural materials, softly lit shadows, graphite steel, warm timber, muted stone and forest accents. Camera at eye level, 35mm lens, avoid fisheye. Frame the subject so it remains recognizable when cropped to a wide 1.85:1 service card, keeping key features inside the central 75% of the height. This is a concept illustration, not a photograph of a completed client project. No text, no labels, no watermark, no split panels, no icons, no flat vector look.

### safe

Use case: ads-marketing. Asset type: Northwoods Vault & Safe website architectural concept imagery. Create one new independent landscape image, approximately 3:2, using the provided image only as a STYLE REFERENCE for photoreal architectural rendering, materials, color grade, soft natural daylight and warm interior lighting. Do not copy its exact scene or add typography. Scene: A freestanding full-height graphite gun safe neatly placed in a finished residential study or equipment room, against a warm pale plaster wall with natural walnut cabinetry beside it, natural stone floor, restrained warm lighting. Clearly a freestanding rectangular steel safe with visible side depth, closed door, a single believable brushed-steel three-spoke handle and a small lock. Entire safe visible with breathing room above and below; safe centered, foreground floor visible. No visible firearms, people, logos, or brand names. Premium realistic architectural visualization with straight verticals, correct perspective, tactile natural materials, softly lit shadows, graphite steel, warm timber, muted stone and forest accents. Camera at eye level, 35mm lens, avoid fisheye. Frame the subject so it remains recognizable when cropped to a wide 1.85:1 service card, keeping key features inside the central 75% of the height. This is a concept illustration, not a photograph of a completed client project. No text, no labels, no watermark, no split panels, no icons, no flat vector look.

Desktop preview was provided separately for review; it is not part of the source release.

