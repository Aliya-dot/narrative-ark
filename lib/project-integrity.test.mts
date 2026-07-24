import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type {
  GenerationDraft,
  GameProject,
  ProjectSettingsSnapshot,
} from "./types.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { emptyProject } = await import("./project.ts");
const { PROJECT_INTEGRITY_CODES, validateProjectIntegrity } =
  await import("./project-integrity.ts");

const draft: GenerationDraft = {
  title: "Integrity fixture",
  idea: "A schema-valid local fixture",
  genre: "mystery",
  protagonist: "investigator",
  tone: "measured",
  freedomMode: "hybrid",
  gameLength: "standard",
  numericSystem: true,
  creationMode: "advanced",
};

function fixture(): GameProject {
  const project = emptyProject(draft);
  project.id = "project-1";
  project.createdAt = "2026-01-01T00:00:00.000Z";
  project.updatedAt = project.createdAt;
  project.world.locations = [
    {
      id: "station",
      name: "Station",
      description: "Start",
      connections: ["archive"],
    },
    {
      id: "archive",
      name: "Archive",
      description: "Destination",
      connections: ["station"],
    },
  ];
  project.world.factions = [
    {
      id: "station",
      name: "Custodians",
      description: "Cross-collection IDs are independent",
      attitude: 0,
      goal: "Preserve records",
    },
  ];
  project.player.talents = [
    { id: "focus", name: "Focus", description: "Observe" },
  ];
  project.player.skills = [
    { id: "focus", name: "Focus", description: "Cross-collection allowed" },
  ];
  project.characters = [
    {
      id: "guide",
      name: "Guide",
      identity: "Archivist",
      age: "adult",
      race: "human",
      personality: "calm",
      appearance: "plain",
      background: "local",
      abilities: [
        { id: "focus", name: "Focus", description: "Per-character namespace" },
      ],
      relationship: "ally",
      attitude: 0,
      goal: "Assist",
      secret: "",
      speechStyle: "brief",
      important: true,
      mortal: true,
    },
  ];
  project.story.chapters = [
    {
      id: "chapter-1",
      title: "Arrival",
      summary: "Begin",
      goals: [],
      importantCharacters: ["guide"],
    },
  ];
  return project;
}

function snapshotOf(project: GameProject): ProjectSettingsSnapshot {
  return {
    projectInfo: structuredClone(project.projectInfo),
    world: structuredClone(project.world),
    player: structuredClone(project.player),
    characters: structuredClone(project.characters),
    gameSystem: structuredClone(project.gameSystem),
    story: structuredClone(project.story),
    prompts: structuredClone(project.prompts),
    openingScene: project.openingScene,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const objectValue: object = value;
    for (const key of Reflect.ownKeys(objectValue)) {
      deepFreeze(Reflect.get(objectValue, key));
    }
    Object.freeze(objectValue);
  }
  return value;
}

let checks = 0;
function check(name: string, run: () => void): void {
  run();
  checks += 1;
  console.log(`ok ${checks} - ${name}`);
}

check("a complete legal project has no integrity issues", () => {
  assert.deepEqual(validateProjectIntegrity(fixture()), []);
});

check("blank and whitespace-only entity IDs have exact paths", () => {
  const project = fixture();
  project.world.locations[0].id = "";
  project.world.factions[0].id = "   ";
  assert.deepEqual(validateProjectIntegrity(project).slice(0, 2), [
    {
      code: PROJECT_INTEGRITY_CODES.blankEntityId,
      path: "world.locations[0].id",
      entityType: "location",
    },
    {
      code: PROJECT_INTEGRITY_CODES.blankEntityId,
      path: "world.factions[0].id",
      entityType: "faction",
    },
  ]);
});

check("duplicates identify the second and subsequent collection items", () => {
  const project = fixture();
  project.story.sideQuests = [
    {
      id: "quest",
      title: "First",
      description: "",
      status: "inactive",
      objectives: [],
    },
    {
      id: "quest",
      title: "Second",
      description: "",
      status: "active",
      objectives: [],
    },
    {
      id: "quest",
      title: "Third",
      description: "",
      status: "active",
      objectives: [],
    },
  ];
  assert.deepEqual(
    validateProjectIntegrity(project).filter(
      ({ code }) => code === PROJECT_INTEGRITY_CODES.duplicateEntityId,
    ),
    [
      {
        code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
        path: "story.sideQuests[1].id",
        entityType: "side_quest",
        entityId: "quest",
      },
      {
        code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
        path: "story.sideQuests[2].id",
        entityType: "side_quest",
        entityId: "quest",
      },
    ],
  );
});

check("cross-collection equal IDs are accepted", () => {
  const project = fixture();
  assert.equal(project.world.locations[0].id, project.world.factions[0].id);
  assert.equal(project.player.talents[0].id, project.player.skills[0].id);
  assert.deepEqual(validateProjectIntegrity(project), []);
});

check("a dangling location connection reports target and entity type", () => {
  const project = fixture();
  project.world.locations[0].connections = ["missing-location"];
  assert.deepEqual(validateProjectIntegrity(project), [
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[0]",
      entityType: "location",
      entityId: "station",
      relatedId: "missing-location",
    },
  ]);
});

check("valid location connection arrays all pass", () => {
  const project = fixture();
  project.world.locations[0].connections = ["archive", "station"];
  project.world.locations[1].connections = ["station", "archive"];
  assert.deepEqual(validateProjectIntegrity(project), []);
});

check("multiple issue kinds are aggregated in deterministic order", () => {
  const project = fixture();
  project.world.locations[0].id = " ";
  project.world.locations[1].id = " ";
  project.world.locations[1].connections = ["missing"];
  const first = validateProjectIntegrity(project);
  const second = validateProjectIntegrity(project);
  assert.deepEqual(first, second);
  assert.deepEqual(
    first.map(({ code, path }) => ({ code, path })),
    [
      {
        code: PROJECT_INTEGRITY_CODES.blankEntityId,
        path: "world.locations[0].id",
      },
      {
        code: PROJECT_INTEGRITY_CODES.blankEntityId,
        path: "world.locations[1].id",
      },
      {
        code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
        path: "world.locations[1].id",
      },
      {
        code: PROJECT_INTEGRITY_CODES.danglingReference,
        path: "world.locations[0].connections[0]",
      },
      {
        code: PROJECT_INTEGRITY_CODES.danglingReference,
        path: "world.locations[1].connections[0]",
      },
    ],
  );
});

check("settings version IDs and confirmed references are checked", () => {
  const project = fixture();
  const snapshot = snapshotOf(project);
  project.settingsVersions = [
    {
      id: "settings-1",
      projectId: project.id,
      versionNumber: 1,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      effectiveFromTurn: 0,
      settingsSnapshot: snapshot,
    },
  ];
  project.currentSettingsVersionId = "missing-settings";
  project.settingsVersions[0].projectId = "missing-project";
  assert.deepEqual(validateProjectIntegrity(project), [
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "currentSettingsVersionId",
      entityType: "settings_version",
      relatedId: "missing-settings",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "settingsVersions[0].projectId",
      entityType: "project",
      entityId: "settings-1",
      relatedId: "missing-project",
    },
  ]);
});

check("the checker never mutates its input", () => {
  const project = fixture();
  const before = structuredClone(project);
  validateProjectIntegrity(project);
  assert.deepEqual(project, before);
});

check("issues do not copy business or prompt text", () => {
  const secret = "PRIVATE-CONTENT-MARKER-9471";
  const project = fixture();
  project.projectInfo.description = secret;
  project.prompts.gameMasterPrompt = secret;
  project.world.locations[0].description = secret;
  project.world.locations[0].connections = ["missing"];
  const serialized = JSON.stringify(validateProjectIntegrity(project));
  assert.equal(serialized.includes(secret), false);
  assert.deepEqual(Object.keys(validateProjectIntegrity(project)[0]).sort(), [
    "code",
    "entityId",
    "entityType",
    "path",
    "relatedId",
  ]);
});

check(
  "chapter importantCharacters remains outside reference validation",
  () => {
    const project = fixture();
    project.story.chapters[0].importantCharacters = ["display name or id"];
    assert.deepEqual(validateProjectIntegrity(project), []);
  },
);

check("settings snapshots report duplicate IDs with complete paths", () => {
  const project = fixture();
  const snapshot = snapshotOf(project);
  snapshot.world.locations.push(structuredClone(snapshot.world.locations[0]));
  snapshot.story.sideQuests = [
    {
      id: "snapshot-quest",
      title: "First",
      description: "",
      status: "inactive",
      objectives: [],
    },
    {
      id: "snapshot-quest",
      title: "Second",
      description: "",
      status: "active",
      objectives: [],
    },
  ];
  project.settingsVersions = [
    {
      id: "settings-1",
      projectId: project.id,
      versionNumber: 1,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      effectiveFromTurn: 0,
      settingsSnapshot: snapshot,
    },
  ];
  project.currentSettingsVersionId = "settings-1";

  assert.deepEqual(validateProjectIntegrity(project), [
    {
      code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
      path: "settingsVersions[0].settingsSnapshot.world.locations[2].id",
      entityType: "location",
      entityId: "station",
    },
    {
      code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
      path: "settingsVersions[0].settingsSnapshot.story.sideQuests[1].id",
      entityType: "side_quest",
      entityId: "snapshot-quest",
    },
  ]);
});

check(
  "settings snapshot dangling connections stay inside the snapshot path",
  () => {
    const project = fixture();
    const snapshot = snapshotOf(project);
    snapshot.world.locations[1].connections = ["missing-in-snapshot"];
    project.settingsVersions = [
      {
        id: "settings-1",
        projectId: project.id,
        versionNumber: 1,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        effectiveFromTurn: 0,
        settingsSnapshot: snapshot,
      },
    ];
    project.currentSettingsVersionId = "settings-1";

    assert.deepEqual(validateProjectIntegrity(project), [
      {
        code: PROJECT_INTEGRITY_CODES.danglingReference,
        path: "settingsVersions[0].settingsSnapshot.world.locations[1].connections[0]",
        entityType: "location",
        entityId: "archive",
        relatedId: "missing-in-snapshot",
      },
    ]);
  },
);

check("deeply frozen legal and illegal projects are accepted", () => {
  const legal = deepFreeze(fixture());
  assert.deepEqual(validateProjectIntegrity(legal), []);

  const illegalProject = fixture();
  illegalProject.world.locations[0].connections = ["missing"];
  const illegal = deepFreeze(illegalProject);
  assert.deepEqual(validateProjectIntegrity(illegal), [
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[0]",
      entityType: "location",
      entityId: "station",
      relatedId: "missing",
    },
  ]);
  assert.equal(Object.isFrozen(illegal.world.locations), true);
  assert.equal(Object.isFrozen(illegal.world.locations[0]), true);
  assert.equal(Object.isFrozen(illegal.world.locations[0].connections), true);
});

check("a deeply frozen invalid project remains completely unchanged", () => {
  const project = fixture();
  const snapshot = snapshotOf(project);
  project.settingsVersions = [
    {
      id: "settings-1",
      projectId: "missing-project",
      versionNumber: 1,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      effectiveFromTurn: 0,
      settingsSnapshot: snapshot,
    },
  ];
  project.currentSettingsVersionId = "missing-settings";
  project.world.locations[0].id = " ";
  project.world.locations[0].connections = ["missing-a", "missing-b"];
  project.world.locations[1].id = " ";
  project.world.locations[1].connections = [];
  const before = structuredClone(project);
  deepFreeze(project);

  assert.deepEqual(validateProjectIntegrity(project), [
    {
      code: PROJECT_INTEGRITY_CODES.blankEntityId,
      path: "world.locations[0].id",
      entityType: "location",
    },
    {
      code: PROJECT_INTEGRITY_CODES.blankEntityId,
      path: "world.locations[1].id",
      entityType: "location",
    },
    {
      code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
      path: "world.locations[1].id",
      entityType: "location",
      entityId: " ",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[0]",
      entityType: "location",
      entityId: " ",
      relatedId: "missing-a",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[1]",
      entityType: "location",
      entityId: " ",
      relatedId: "missing-b",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "currentSettingsVersionId",
      entityType: "settings_version",
      relatedId: "missing-settings",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "settingsVersions[0].projectId",
      entityType: "project",
      entityId: "settings-1",
      relatedId: "missing-project",
    },
  ]);
  assert.deepEqual(project, before);
});

check("character ability uniqueness is scoped to each character", () => {
  const project = fixture();
  const secondCharacter = structuredClone(project.characters[0]);
  secondCharacter.id = "second-guide";
  secondCharacter.abilities[0].id = "shared-ability";
  project.characters[0].abilities[0].id = "shared-ability";
  project.characters.push(secondCharacter);
  assert.deepEqual(validateProjectIntegrity(project), []);

  project.characters[1].abilities.push(
    structuredClone(project.characters[1].abilities[0]),
  );
  assert.deepEqual(
    validateProjectIntegrity(project).filter(
      ({ code }) => code === PROJECT_INTEGRITY_CODES.duplicateEntityId,
    ),
    [
      {
        code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
        path: "characters[1].abilities[1].id",
        entityType: "character_ability",
        entityId: "shared-ability",
      },
    ],
  );
});

check("multiple dangling connections preserve index and input order", () => {
  const project = fixture();
  project.world.locations[0].connections = ["missing-first", "missing-second"];
  assert.deepEqual(validateProjectIntegrity(project), [
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[0]",
      entityType: "location",
      entityId: "station",
      relatedId: "missing-first",
    },
    {
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "world.locations[0].connections[1]",
      entityType: "location",
      entityId: "station",
      relatedId: "missing-second",
    },
  ]);
});

type EntityCollectionCase = {
  name: string;
  entityType: string;
  firstPath: string;
  secondPath: string;
  populate: (project: GameProject, firstId: string, secondId: string) => void;
};

const entityCollectionCases: EntityCollectionCase[] = [
  {
    name: "world.locations",
    entityType: "location",
    firstPath: "world.locations[0].id",
    secondPath: "world.locations[1].id",
    populate(project, firstId, secondId) {
      project.world.locations = [
        { id: firstId, name: "A", description: "", connections: [] },
        { id: secondId, name: "B", description: "", connections: [] },
      ];
    },
  },
  {
    name: "world.factions",
    entityType: "faction",
    firstPath: "world.factions[0].id",
    secondPath: "world.factions[1].id",
    populate(project, firstId, secondId) {
      project.world.factions = [
        { id: firstId, name: "A", description: "", attitude: 0, goal: "" },
        { id: secondId, name: "B", description: "", attitude: 0, goal: "" },
      ];
    },
  },
  {
    name: "player.talents",
    entityType: "player_talent",
    firstPath: "player.talents[0].id",
    secondPath: "player.talents[1].id",
    populate(project, firstId, secondId) {
      project.player.talents = [
        { id: firstId, name: "A", description: "" },
        { id: secondId, name: "B", description: "" },
      ];
    },
  },
  {
    name: "player.skills",
    entityType: "player_skill",
    firstPath: "player.skills[0].id",
    secondPath: "player.skills[1].id",
    populate(project, firstId, secondId) {
      project.player.skills = [
        { id: firstId, name: "A", description: "" },
        { id: secondId, name: "B", description: "" },
      ];
    },
  },
  {
    name: "player.inventory",
    entityType: "player_inventory_item",
    firstPath: "player.inventory[0].id",
    secondPath: "player.inventory[1].id",
    populate(project, firstId, secondId) {
      project.player.inventory = [
        { id: firstId, name: "A", description: "", quantity: 1 },
        { id: secondId, name: "B", description: "", quantity: 1 },
      ];
    },
  },
  {
    name: "player.equipment",
    entityType: "player_equipment_item",
    firstPath: "player.equipment[0].id",
    secondPath: "player.equipment[1].id",
    populate(project, firstId, secondId) {
      project.player.equipment = [
        { id: firstId, name: "A", description: "", quantity: 1 },
        { id: secondId, name: "B", description: "", quantity: 1 },
      ];
    },
  },
  {
    name: "player.statusEffects",
    entityType: "player_status_effect",
    firstPath: "player.statusEffects[0].id",
    secondPath: "player.statusEffects[1].id",
    populate(project, firstId, secondId) {
      project.player.statusEffects = [
        { id: firstId, name: "A", description: "" },
        { id: secondId, name: "B", description: "" },
      ];
    },
  },
  {
    name: "characters",
    entityType: "character",
    firstPath: "characters[0].id",
    secondPath: "characters[1].id",
    populate(project, firstId, secondId) {
      const first = structuredClone(project.characters[0]);
      const second = structuredClone(project.characters[0]);
      first.id = firstId;
      second.id = secondId;
      project.characters = [first, second];
    },
  },
  {
    name: "characters[0].abilities",
    entityType: "character_ability",
    firstPath: "characters[0].abilities[0].id",
    secondPath: "characters[0].abilities[1].id",
    populate(project, firstId, secondId) {
      project.characters[0].abilities = [
        { id: firstId, name: "A", description: "" },
        { id: secondId, name: "B", description: "" },
      ];
    },
  },
  {
    name: "gameSystem.attributes",
    entityType: "attribute_definition",
    firstPath: "gameSystem.attributes[0].id",
    secondPath: "gameSystem.attributes[1].id",
    populate(project, firstId, secondId) {
      project.gameSystem.attributes = [
        { id: firstId, name: "A", initial: 0, max: 100, display: "number" },
        { id: secondId, name: "B", initial: 0, max: 100, display: "bar" },
      ];
    },
  },
  {
    name: "story.chapters",
    entityType: "story_chapter",
    firstPath: "story.chapters[0].id",
    secondPath: "story.chapters[1].id",
    populate(project, firstId, secondId) {
      project.story.chapters = [
        { id: firstId, title: "A", summary: "", goals: [] },
        { id: secondId, title: "B", summary: "", goals: [] },
      ];
    },
  },
  {
    name: "story.sideQuests",
    entityType: "side_quest",
    firstPath: "story.sideQuests[0].id",
    secondPath: "story.sideQuests[1].id",
    populate(project, firstId, secondId) {
      project.story.sideQuests = [
        {
          id: firstId,
          title: "A",
          description: "",
          status: "inactive",
          objectives: [],
        },
        {
          id: secondId,
          title: "B",
          description: "",
          status: "active",
          objectives: [],
        },
      ];
    },
  },
  {
    name: "story.randomEvents",
    entityType: "random_event",
    firstPath: "story.randomEvents[0].id",
    secondPath: "story.randomEvents[1].id",
    populate(project, firstId, secondId) {
      project.story.randomEvents = [
        { id: firstId, title: "A", trigger: "", description: "" },
        { id: secondId, title: "B", trigger: "", description: "" },
      ];
    },
  },
  {
    name: "story.endings",
    entityType: "ending",
    firstPath: "story.endings[0].id",
    secondPath: "story.endings[1].id",
    populate(project, firstId, secondId) {
      project.story.endings = [
        { id: firstId, title: "A", conditions: [], description: "" },
        { id: secondId, title: "B", conditions: [], description: "" },
      ];
    },
  },
  {
    name: "settingsVersions",
    entityType: "settings_version",
    firstPath: "settingsVersions[0].id",
    secondPath: "settingsVersions[1].id",
    populate(project, firstId, secondId) {
      project.settingsVersions = [
        {
          id: firstId,
          projectId: project.id,
          versionNumber: 1,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          effectiveFromTurn: 0,
          settingsSnapshot: snapshotOf(project),
        },
        {
          id: secondId,
          projectId: project.id,
          versionNumber: 2,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          effectiveFromTurn: 1,
          settingsSnapshot: snapshotOf(project),
        },
      ];
    },
  },
];

check("the project root reports a precise blank ID issue", () => {
  const project = fixture();
  project.id = "\t \n";
  assert.deepEqual(
    validateProjectIntegrity(project).filter(
      ({ code }) => code === PROJECT_INTEGRITY_CODES.blankEntityId,
    ),
    [
      {
        code: PROJECT_INTEGRITY_CODES.blankEntityId,
        path: "id",
        entityType: "project",
      },
    ],
  );
});

for (const collectionCase of entityCollectionCases) {
  check(`${collectionCase.name} reports blank and duplicate IDs`, () => {
    const blankProject = fixture();
    collectionCase.populate(blankProject, "\t \n", `${collectionCase.name}-2`);
    assert.deepEqual(
      validateProjectIntegrity(blankProject).filter(
        ({ code }) => code === PROJECT_INTEGRITY_CODES.blankEntityId,
      ),
      [
        {
          code: PROJECT_INTEGRITY_CODES.blankEntityId,
          path: collectionCase.firstPath,
          entityType: collectionCase.entityType,
        },
      ],
    );

    const duplicateProject = fixture();
    collectionCase.populate(duplicateProject, "duplicate", "duplicate");
    assert.deepEqual(
      validateProjectIntegrity(duplicateProject).filter(
        ({ code }) => code === PROJECT_INTEGRITY_CODES.duplicateEntityId,
      ),
      [
        {
          code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
          path: collectionCase.secondPath,
          entityType: collectionCase.entityType,
          entityId: "duplicate",
        },
      ],
    );
  });
}

console.log(`project-integrity tests passed (${checks} checks)`);
