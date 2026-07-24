import type {
  GameCharacter,
  GameProject,
  ProjectSettingsSnapshot,
} from "./types";

export const PROJECT_INTEGRITY_CODES = {
  blankEntityId: "blank_entity_id",
  duplicateEntityId: "duplicate_entity_id",
  danglingReference: "dangling_reference",
} as const;

export type ProjectIntegrityIssueCode =
  (typeof PROJECT_INTEGRITY_CODES)[keyof typeof PROJECT_INTEGRITY_CODES];

export type ProjectIntegrityIssue = {
  code: ProjectIntegrityIssueCode;
  path: string;
  entityType?: string;
  entityId?: string;
  relatedId?: string;
};

type Entity = { id: string };

type EntityCollection = {
  entities: readonly Entity[];
  path: string;
  entityType: string;
};

type ProjectContent = Pick<
  GameProject,
  "world" | "player" | "characters" | "gameSystem" | "story"
>;

function contentCollections(
  content: ProjectContent | ProjectSettingsSnapshot,
  prefix: string,
): EntityCollection[] {
  const collections: EntityCollection[] = [
    {
      entities: content.world.locations,
      path: `${prefix}world.locations`,
      entityType: "location",
    },
    {
      entities: content.world.factions,
      path: `${prefix}world.factions`,
      entityType: "faction",
    },
    {
      entities: content.player.talents,
      path: `${prefix}player.talents`,
      entityType: "player_talent",
    },
    {
      entities: content.player.skills,
      path: `${prefix}player.skills`,
      entityType: "player_skill",
    },
    {
      entities: content.player.inventory,
      path: `${prefix}player.inventory`,
      entityType: "player_inventory_item",
    },
    {
      entities: content.player.equipment,
      path: `${prefix}player.equipment`,
      entityType: "player_equipment_item",
    },
    {
      entities: content.player.statusEffects,
      path: `${prefix}player.statusEffects`,
      entityType: "player_status_effect",
    },
    {
      entities: content.characters,
      path: `${prefix}characters`,
      entityType: "character",
    },
  ];

  content.characters.forEach((character: GameCharacter, index: number) => {
    collections.push({
      entities: character.abilities,
      path: `${prefix}characters[${index}].abilities`,
      entityType: "character_ability",
    });
  });

  collections.push(
    {
      entities: content.gameSystem.attributes,
      path: `${prefix}gameSystem.attributes`,
      entityType: "attribute_definition",
    },
    {
      entities: content.story.chapters,
      path: `${prefix}story.chapters`,
      entityType: "story_chapter",
    },
    {
      entities: content.story.sideQuests,
      path: `${prefix}story.sideQuests`,
      entityType: "side_quest",
    },
    {
      entities: content.story.randomEvents,
      path: `${prefix}story.randomEvents`,
      entityType: "random_event",
    },
    {
      entities: content.story.endings,
      path: `${prefix}story.endings`,
      entityType: "ending",
    },
  );

  return collections;
}

function validateCollection(
  collection: EntityCollection,
  issues: ProjectIntegrityIssue[],
): void {
  const seen = new Set<string>();

  collection.entities.forEach((entity, index) => {
    const path = `${collection.path}[${index}].id`;
    if (entity.id.trim() === "") {
      issues.push({
        code: PROJECT_INTEGRITY_CODES.blankEntityId,
        path,
        entityType: collection.entityType,
      });
    }
    if (seen.has(entity.id)) {
      issues.push({
        code: PROJECT_INTEGRITY_CODES.duplicateEntityId,
        path,
        entityType: collection.entityType,
        entityId: entity.id,
      });
    } else {
      seen.add(entity.id);
    }
  });
}

function validateLocationReferences(
  content: ProjectContent | ProjectSettingsSnapshot,
  prefix: string,
  issues: ProjectIntegrityIssue[],
): void {
  const locationIds = new Set(content.world.locations.map(({ id }) => id));
  content.world.locations.forEach((location, locationIndex) => {
    location.connections.forEach((relatedId, connectionIndex) => {
      if (!locationIds.has(relatedId)) {
        issues.push({
          code: PROJECT_INTEGRITY_CODES.danglingReference,
          path: `${prefix}world.locations[${locationIndex}].connections[${connectionIndex}]`,
          entityType: "location",
          entityId: location.id,
          relatedId,
        });
      }
    });
  });
}

/**
 * Checks identity and confirmed in-project reference semantics without changing
 * the schema, project, persistence, or any application workflow.
 */
export function validateProjectIntegrity(
  project: GameProject,
): ProjectIntegrityIssue[] {
  const issues: ProjectIntegrityIssue[] = [];

  if (project.id.trim() === "") {
    issues.push({
      code: PROJECT_INTEGRITY_CODES.blankEntityId,
      path: "id",
      entityType: "project",
    });
  }

  for (const collection of contentCollections(project, "")) {
    validateCollection(collection, issues);
  }

  const settingsVersions = project.settingsVersions ?? [];
  validateCollection(
    {
      entities: settingsVersions,
      path: "settingsVersions",
      entityType: "settings_version",
    },
    issues,
  );

  settingsVersions.forEach((version, versionIndex) => {
    for (const collection of contentCollections(
      version.settingsSnapshot,
      `settingsVersions[${versionIndex}].settingsSnapshot.`,
    )) {
      validateCollection(collection, issues);
    }
  });

  validateLocationReferences(project, "", issues);
  settingsVersions.forEach((version, versionIndex) => {
    validateLocationReferences(
      version.settingsSnapshot,
      `settingsVersions[${versionIndex}].settingsSnapshot.`,
      issues,
    );
  });

  const settingsVersionIds = new Set(settingsVersions.map(({ id }) => id));
  if (
    project.currentSettingsVersionId !== undefined &&
    !settingsVersionIds.has(project.currentSettingsVersionId)
  ) {
    issues.push({
      code: PROJECT_INTEGRITY_CODES.danglingReference,
      path: "currentSettingsVersionId",
      entityType: "settings_version",
      relatedId: project.currentSettingsVersionId,
    });
  }

  settingsVersions.forEach((version, versionIndex) => {
    if (version.projectId !== project.id) {
      issues.push({
        code: PROJECT_INTEGRITY_CODES.danglingReference,
        path: `settingsVersions[${versionIndex}].projectId`,
        entityType: "project",
        entityId: version.id,
        relatedId: version.projectId,
      });
    }
  });

  return issues;
}
