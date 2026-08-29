// Narrow client entry point: keep Babylon XR/editor surfaces out of the town.
// Babylon's picking helpers register through this focused side-effect module.
import "@babylonjs/core/Culling/ray";

export { Engine } from "@babylonjs/core/Engines/engine";
export { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
export { Color3 } from "@babylonjs/core/Maths/math.color";
