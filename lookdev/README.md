# Lookdev: path-traced reference frames

`catalog.py` builds the Catalog window in Blender at its real size (the numbers in `src/core/defaults.js` and `tokens.json`). It lights the window with the same room HDR the demo uses and renders it with Cycles path tracing. These frames show what the glass physically looks like. The live three.js shader is tuned until it matches them side by side.

```sh
python3 -m pip install bpy        # Blender 5.x as a Python module
python3 lookdev/catalog.py --state hover --view front --fov 17 --samples 128 --res 1400x1000 --absorb 110 --out lookdev/shots/hover-front.png
npm run bench -- lookdev          # the live component at the same framings → shots/bench/live-*.png
```

States: `rest`, `hover`, `levels`. Views: `front`, `angle` (35° to the side). Glass parameters: `--tint`, `--absorb` (1/m), `--rough`.

- `fonts/` holds Inter (SIL Open Font License), converted to TTF for Blender.
- `catalog.json` is the demo content (`demo/catalog-data.js`).
