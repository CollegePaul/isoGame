import { BoxHelper, Color, Group, Mesh } from "three";

const HOVER_COLOR = new Color(0x73b5ff);
const SELECT_COLOR = new Color(0x4c8bf5);

export class SelectionOverlay extends Group {
  constructor() {
    super();
    this.name = "SelectionOverlay";
    this.hoverHelper = null;
    this.activeHelper = null;
  }

  updateHover(target) {
    this._updateHelper("hover", target, HOVER_COLOR, 1.0, 0.7);
  }

  updateSelection(target) {
    this._updateHelper("active", target, SELECT_COLOR, 1.0, 0.9);
  }

  clearHover() {
    this._clearHelper("hover");
  }

  clearSelection() {
    this._clearHelper("active");
  }

  clearAll() {
    this.clearHover();
    this.clearSelection();
  }

  _updateHelper(type, target, color, inflateFactor = 1.0, transparency = 1.0) {
    if (!target) {
      this._clearHelper(type);
      return;
    }
    if (typeof target.updateMatrixWorld === "function") {
      target.updateMatrixWorld(true);
    }
    const helperName = type === "hover" ? "hoverHelper" : "activeHelper";
    let helper = this[helperName];
    if (!helper) {
      helper = new BoxHelper(new Mesh(), color.getHex());
      helper.material.depthWrite = false;
      helper.material.transparent = true;
      helper.material.opacity = transparency;
      helper.visible = true;
      this[helperName] = helper;
      this.add(helper);
    }
    helper.visible = true;
    helper.material.color.copy(color);
    helper.material.opacity = transparency;
    helper.update(target);
    helper.scale.setScalar(inflateFactor);
  }

  _clearHelper(type) {
    const helperName = type === "hover" ? "hoverHelper" : "activeHelper";
    const helper = this[helperName];
    if (helper) {
      helper.visible = false;
    }
  }
}

export function attachSelectionOverlay(scene) {
  const overlay = new SelectionOverlay();
  scene.add(overlay);
  return overlay;
}
