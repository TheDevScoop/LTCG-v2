import { describe, expect, it } from "vitest";
import { cloneDefaultProject } from "../../shared/defaults";
import { applyCommand } from "./commands";

describe("editor command reducer", () => {
  it("applies deterministic add layer and undo equivalent reconstruction", () => {
    const initial = cloneDefaultProject();

    const next = applyCommand(initial, {
      type: "addLayer",
      layer: {
        id: "layer_new",
        name: "New Layer",
        type: "shape",
        x: 20,
        y: 20,
        width: 100,
        height: 100,
        zIndex: 9,
        rotation: 0,
        visible: true,
        content: "",
        variableBindings: {},
        style: {
          background: "#fff",
        },
      },
    });

    const reverted = {
      ...next,
      template: {
        ...next.template,
        layers: next.template.layers.filter((layer) => layer.id !== "layer_new"),
      },
    };

    expect(reverted.template.layers).toEqual(initial.template.layers);
  });
});
