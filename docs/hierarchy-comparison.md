# Hierarchy comparison fixture

This separate entry compares Flat same-pane catalog navigation with the existing Contour compress stack. It implements the Q121/Q122 fixture contract, not a new public DS component or a final global Packaging policy.

Open `hierarchy-comparison.html`. Choose Chairs or Tables, then a catalog item. Both sides show its authored name, category, dimensions, proportional rectangular footprint and **Demo catalog** caption. Flat Back returns to its parent; Contour uses the exposed rear title and the existing supported hand Push. Reset restores both roots. Each side keeps independent navigation state.

## Scope and source

`HierarchyPanel` retains original Packaging selection ordering, continuing-owner protection, material and Push. Its fixture adapter opens a read-only detail after a leaf callback at the safe update boundary. Callback order remains observable; multiple actions attach to the original parent, and only the final destination is shown. Flat uses finite rectangular row faces and a bounded Back button. Shared components/tokens, the original demo and other fixtures are unchanged.

The four catalog values come from `demo/catalog-data.js`: Lounge chair 78 × 82 cm; Dining chair 46 × 52 cm; Coffee table 100 × 55 cm; Side table 45 × 45 cm. Footprints depict those two dimensions only. No measured object, photo, height, price or maker is implied.

Local fixture metrics: pane width .144 m and height .20 m before root scale 1.5; side offsets ±.23 m; default root (0,1.48,-.68) m. Detail diagram fits .097 × .075 m with an item-specific uniform cm-to-m factor. Category/dimension/caption y positions .058/.038/−.063 m, font sizes .0084/.0102/.0084 m. Flat Back center y −.087 m. Construction distance remains .6 m. These are prototype layout values, not final DS tokens. First XR viewer pose places the scene .68 m ahead and .12 m below the viewer, yaw-only; later re-entry preserves that placement. No spatial anchor persistence is claimed.

## Input and lifecycle

- Actual desktop pointer and semantic far select route through public InputSystem target acquisition.
- Current near hand/controller contact uses the existing Button approach/contact/release policy. This does not add slider native pinch or corner manipulation semantics.
- Contour hand-joint Push keeps existing withdrawal/loss, single-child dismissal and retreat rearm; Flat has a logical Back equivalent, not the same gesture.
- Lost pose/capture, source replacement, page/session loss and reset cannot synthesize an action. A held source must release before reacquiring; fixture semantic-edge history survives source replacement. Fresh Contour row acquisition is temporarily blocked when its visible bounds overlap an in-front closing pane, while captured owners and exposed Back remain separate. Cancellation updates press state without integrating a fabricated one-second visual frame.
- Reset cancels pending routing and restores both Catalog roots. Loss retains committed content. Disposal removes fixture listeners and owned scene resources.

Window movement, resizing, close rail, Dropdown, mode switching, palm app exit and distance reevaluation are excluded. Original window movement/resize and Packaging mode controls remain available elsewhere. Dropdown and closing rail are not implemented; palm app exit and distance reevaluation are not provided here.

## Verification boundary

`test/hierarchy-comparison.test.js` uses actual InputSystem and component code with headless fonts, synthetic poses/events and public ray/contact acquisition. It checks navigation, all four details, overlapping requests, callbacks, return, reset/rearm, non-steal, source/pose loss, supported synthetic Push and cleanup. It does not establish actual Quest behavior or glyph fit.

`scripts/verify-hierarchy-comparison.mjs` runs a temporary local built preview and browser, uses actual pointer/GL/text shaping, opens all four details on both sides, checks glyph/diagram/Back bounds, return/reset/capture loss, reduced-motion output and cleanup. It requests no native XR session and sends no POST. Its scripted exploration includes guidance; it does not measure unaided discovery.

Actual Quest input, MR readability/occlusion, comfort, discovery and user acceptance remain unknown. GPU performance is deferred and unmeasured. No evidence here completes the original #12/#13 criteria.
