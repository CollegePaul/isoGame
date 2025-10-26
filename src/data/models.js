const withDefaults = (definition) => ({
  collectable: false,
  solid: true,
  size: [1, 1, 1],
  defaultState: "default",
  requirements: [],
  transformsTo: null,
  interactions: null,
  tags: [],
  description: "",
  label: definition.id,
  ...definition,
});

export const modelDefinitions = {
  monitor: withDefaults({
    id: "monitor",
    label: "Computer Monitor",
    size: [1, 1, 1],
    collectable: true,
    solid: true,
    defaultState: "inactive",
    transformsTo: "monitor_on",
    description: "A computer monitor. The screen is dark but the power light glows.",
    tags: ["electronics", "computer"],
  }),
  monitor_on: withDefaults({
    id: "monitor_on",
    label: "Computer Monitor (Active)",
    size: [1, 1, 1],
    collectable: true,
    solid: true,
    defaultState: "active",
    description: "A bright CRT monitor displaying diagnostic numbers: 52953.",
    tags: ["electronics", "computer"],
  }),
  table: withDefaults({
    id: "table",
    label: "Utility Table",
    size: [1, 1, 1],
    collectable: false,
    solid: true,
    description: "A sturdy industrial table ready to hold heavy equipment.",
    tags: ["furniture"],
  }),
  computer: withDefaults({
    id: "computer",
    label: "Mainframe Computer",
    size: [1, 2, 1],
    collectable: false,
    solid: true,
    defaultState: "inactive",
    requirements: ["tape"],
    transformsTo: "computer_on",
    description: "A towering mainframe with an empty tape deck. It hums quietly.",
    tags: ["electronics", "computer"],
  }),
  computer_on: withDefaults({
    id: "computer_on",
    label: "Mainframe Computer (Active)",
    size: [1, 2, 1],
    collectable: false,
    solid: true,
    defaultState: "active",
    description: "The mainframe blinks with green lights. The tape drive spins smoothly.",
    tags: ["electronics", "computer"],
  }),
  tape: withDefaults({
    id: "tape",
    label: "Data Tape",
    size: [1, 0.25, 1],
    collectable: true,
    solid: false,
    description: "A reel of magnetic tape labeled 'System Boot'.", 
    tags: ["item", "electronics"],
  }),
  teleporter: withDefaults({
    id: "teleporter",
    label: "Teleporter Pad",
    size: [1, 2, 1],
    collectable: false,
    solid: false,
    description: "A humming platform capable of quantum relocation.",
    tags: ["technology", "teleport"],
    defaultState: "idle",
    interactions: {
      type: "teleport",
      targetRoom: null,
      targetSpawn: null,
    },
  }),
};

export function getModelDefinition(id) {
  return modelDefinitions[id] ?? null;
}

export function listModelDefinitions() {
  return Object.values(modelDefinitions);
}
