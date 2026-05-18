# Design Doc - Remove Fog and Add Environment Control Pane

## Problem
- The current scene has a fog effect that needs to be removed.
- There is no UI to control environment properties like background blurriness and intensity.

## Proposed Changes

### 1. Remove Fog Logic
- In `src/world/environment.js`:
    - Remove `fogColor`, `fogRange` properties.
    - Remove `_rebuildFog()` method.
    - Remove fog-related UI bindings in `debuggerInit()`.
- In `src/app/Experience.js`:
    - Remove `this.renderer.instance.setClearColor(this.environment.fogColor.value)` as `fogColor` will be removed.

### 2. Add Environment Control Pane
- In `src/world/environment.js`:
    - Add `envParams` to store `backgroundBlurriness`, `backgroundIntensity`, and `environmentIntensity`.
    - Update `loadHDR` to apply these initial values.
    - In `debuggerInit()`, add bindings for these parameters to allow real-time adjustment.

## Verification Plan
- Open the debug UI.
- Verify that the "Environment" folder no longer contains fog settings.
- Verify that new sliders for "Background Blurriness", "Background Intensity", and "Environment Intensity" are present and functional.
- Confirm that the fog effect is gone from the scene.
