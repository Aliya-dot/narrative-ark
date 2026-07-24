import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import type { GenerationDraft, GameProject } from "./types.ts";

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
  const snapshot = {
    projectInfo: structuredClone(project.projectInfo),
    world: structuredClone(project.world),
    player: structuredClone(project.player),
    characters: structuredClone(project.characters),
    gameSystem: structuredClone(project.gameSystem),
    story: structuredClone(project.story),
    prompts: structuredClone(project.prompts),
    openingScene: project.openingScene,
  };
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
  assert.deepEqual(validateProjectIntegrity(project).slice(-2), [
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
  const before = JSON.stringify(project);
  validateProjectIntegrity(project);
  assert.equal(JSON.stringify(project), before);

  const frozen = structuredClone(project);
  Object.freeze(frozen);
  assert.doesNotThrow(() => validateProjectIntegrity(frozen));
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

console.log(`project-integrity tests passed (${checks} checks)`);
