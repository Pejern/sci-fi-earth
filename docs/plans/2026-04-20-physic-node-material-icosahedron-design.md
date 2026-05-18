# Design: PhysicNodeMaterial Icosahedron with HDR Environment Lighting

This design outlines the implementation of a physical material icosahedron in a Three.js WebGPU environment, illuminated by an HDR environment map.

## 1. Problem Understanding
The goal is to create a simple scene in the `World` class featuring an icosahedron geometry using `MeshPhysicalNodeMaterial` (TSL), and illuminate it using an HDR environment light managed by the `Environment` class.

## 2. Solution Design
The implementation will be split into two main parts:

### A. Environment Setup (`src/world/environment.js`)
- Use `RGBELoader` to load the HDR file located at `public/hdr/studio_small_08_1k.hdr`.
- Set the loaded texture as `scene.environment` and `scene.background`.
- Ensure `texture.mapping` is set to `THREE.EquirectangularReflectionMapping`.

### B. World Object Creation (`src/world/world.js`)
- Create a `THREE.IcosahedronGeometry(1, 0)`.
- Use `THREE.MeshPhysicalNodeMaterial` for the mesh.
- Configure material properties using TSL:
    - `colorNode`: `color(0xffffff)`
    - `roughnessNode`: `float(0.1)`
    - `metalnessNode`: `float(1.0)`
- Add the mesh to the scene.

## 3. Implementation Plan
1.  **Environment**: Update `Environment` class to handle HDR loading.
2.  **World**: Update `World` class to create the icosahedron and apply the physical node material.
3.  **Debug**: Add debug controls for material properties (roughness, metalness).

## 4. Verification
- The icosahedron should appear in the scene with realistic reflections from the HDR environment.
- Material properties should be adjustable via the debug UI.
