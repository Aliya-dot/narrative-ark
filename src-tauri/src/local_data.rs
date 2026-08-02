use rusqlite::backup::Backup;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, ErrorCode, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const TABLES: &[&str] = &[
    "projects",
    "configs",
    "saves",
    "drafts",
    "exports",
    "worldBooks",
    "worldBookEntries",
    "worldBookVersions",
    "scenarios",
];

const MIGRATIONS: &[(i64, &str, &str)] = &[
    (
        1,
        "create_local_records",
        include_str!("../migrations/0001_local_records.sql"),
    ),
    (
        2,
        "create_backup_events",
        include_str!("../migrations/0002_backup_events.sql"),
    ),
];

pub struct LocalDatabase {
    connection: Mutex<Connection>,
    backup_dir: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    id: String,
    created_at_ms: u64,
    size: u64,
    reason: String,
}

fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .map_err(|error| error.to_string())
}

fn validate_table(table: &str) -> Result<(), String> {
    if TABLES.contains(&table) {
        Ok(())
    } else {
        Err(format!("unknown local table: {table}"))
    }
}

fn lock_database(state: &LocalDatabase) -> Result<MutexGuard<'_, Connection>, String> {
    state
        .connection
        .lock()
        .map_err(|_| "local database lock poisoned".to_string())
}

fn apply_migrations(connection: &mut Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
               version INTEGER PRIMARY KEY,
               name TEXT NOT NULL,
               applied_at_ms INTEGER NOT NULL
             ) WITHOUT ROWID;",
        )
        .map_err(|error| error.to_string())?;

    for (version, name, sql) in MIGRATIONS {
        let applied = connection
            .query_row(
                "SELECT 1 FROM schema_migrations WHERE version = ?1",
                [version],
                |_| Ok(()),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .is_some();
        if applied {
            continue;
        }
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute_batch(sql)
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO schema_migrations(version, name, applied_at_ms)
                 VALUES (?1, ?2, ?3)",
                params![version, name, now_ms()? as i64],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
    }
    Ok(())
}

impl LocalDatabase {
    pub fn open(app: &AppHandle) -> Result<Self, String> {
        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;
        let backup_dir = data_dir.join("backups");
        fs::create_dir_all(&backup_dir).map_err(|error| error.to_string())?;
        let path = data_dir.join("narrative-ark.sqlite3");
        let mut connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(10))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA temp_store = MEMORY;",
            )
            .map_err(|error| error.to_string())?;
        apply_migrations(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            backup_dir,
        })
    }
}

fn string_at(record: &Value, path: &[&str]) -> Option<String> {
    let mut value = record;
    for key in path {
        value = value.get(*key)?;
    }
    value.as_str().map(str::to_owned)
}

fn indexed_values(table: &str, record: &Value) -> (Option<String>, Option<String>, Option<i64>) {
    let parent = match table {
        "saves" | "exports" => string_at(record, &["projectId"]),
        "worldBookEntries" | "worldBookVersions" | "scenarios" => {
            string_at(record, &["worldBookId"])
        }
        "projects" => string_at(record, &["worldBinding", "worldBookId"]),
        _ => None,
    };
    let indexed_at =
        string_at(record, &["updatedAt"]).or_else(|| string_at(record, &["createdAt"]));
    let sort_number = record.get("versionNumber").and_then(Value::as_i64);
    (parent, indexed_at, sort_number)
}

fn constraint_error(error: rusqlite::Error) -> String {
    if let rusqlite::Error::SqliteFailure(code, _) = &error {
        if matches!(code.code, ErrorCode::ConstraintViolation) {
            return format!("constraint: {error}");
        }
    }
    error.to_string()
}

fn put_record(
    connection: &Connection,
    table: &str,
    record: &Value,
    add_only: bool,
) -> Result<(), String> {
    validate_table(table)?;
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "local record id is required".to_string())?;
    let (parent_id, indexed_at, sort_number) = indexed_values(table, record);
    let payload = serde_json::to_string(record).map_err(|error| error.to_string())?;
    let sql = if add_only {
        "INSERT INTO local_records
           (table_name, id, parent_id, indexed_at, sort_number, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    } else {
        "INSERT INTO local_records
           (table_name, id, parent_id, indexed_at, sort_number, payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(table_name, id) DO UPDATE SET
           parent_id = excluded.parent_id,
           indexed_at = excluded.indexed_at,
           sort_number = excluded.sort_number,
           payload = excluded.payload"
    };
    connection
        .execute(
            sql,
            params![table, id, parent_id, indexed_at, sort_number, payload],
        )
        .map(|_| ())
        .map_err(constraint_error)
}

fn parse_payload(payload: String) -> Result<Value, String> {
    serde_json::from_str(&payload).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_initialize() {}

#[tauri::command]
pub fn local_db_get(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    id: String,
) -> Result<Option<Value>, String> {
    validate_table(&table)?;
    let connection = lock_database(&state)?;
    let payload = connection
        .query_row(
            "SELECT payload FROM local_records WHERE table_name = ?1 AND id = ?2",
            params![table, id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    payload.map(parse_payload).transpose()
}

fn filter_column(field: &str) -> Result<&'static str, String> {
    match field {
        "projectId" | "worldBookId" => Ok("parent_id"),
        _ => Err(format!("unsupported local query filter: {field}")),
    }
}

fn order_column(field: &str) -> Result<&'static str, String> {
    match field {
        "updatedAt" | "createdAt" => Ok("indexed_at"),
        "versionNumber" => Ok("sort_number"),
        _ => Err(format!("unsupported local query order: {field}")),
    }
}

#[tauri::command]
pub fn local_db_query(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    filter_field: Option<String>,
    filter_value: Option<String>,
    order_by: Option<String>,
    descending: Option<bool>,
) -> Result<Vec<Value>, String> {
    validate_table(&table)?;
    let mut sql = "SELECT payload FROM local_records WHERE table_name = ?1".to_string();
    let mut values = vec![SqlValue::Text(table)];
    if let (Some(field), Some(value)) = (filter_field.as_deref(), filter_value) {
        sql.push_str(&format!(" AND {} = ?2", filter_column(field)?));
        values.push(SqlValue::Text(value));
    }
    if let Some(field) = order_by.as_deref() {
        sql.push_str(&format!(
            " ORDER BY {} {}",
            order_column(field)?,
            if descending.unwrap_or(false) {
                "DESC"
            } else {
                "ASC"
            }
        ));
    }
    let connection = lock_database(&state)?;
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params_from_iter(values), |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        row.map_err(|error| error.to_string())
            .and_then(parse_payload)
    })
    .collect()
}

#[tauri::command]
pub fn local_db_put(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    record: Value,
    add_only: bool,
) -> Result<(), String> {
    let connection = lock_database(&state)?;
    put_record(&connection, &table, &record, add_only)
}

#[tauri::command]
pub fn local_db_bulk_put(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    records: Vec<Value>,
    add_only: bool,
) -> Result<(), String> {
    validate_table(&table)?;
    let connection = lock_database(&state)?;
    connection
        .execute_batch("SAVEPOINT narrative_bulk_put")
        .map_err(|error| error.to_string())?;
    for record in &records {
        if let Err(error) = put_record(&connection, &table, record, add_only) {
            let _ = connection
                .execute_batch("ROLLBACK TO narrative_bulk_put; RELEASE narrative_bulk_put;");
            return Err(error);
        }
    }
    connection
        .execute_batch("RELEASE narrative_bulk_put")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_update(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    id: String,
    changes: Value,
) -> Result<usize, String> {
    validate_table(&table)?;
    let mut existing = match local_db_get(state.clone(), table.clone(), id.clone())? {
        Some(value) => value,
        None => return Ok(0),
    };
    let existing_object = existing
        .as_object_mut()
        .ok_or_else(|| "stored local record is not an object".to_string())?;
    let changes_object = changes
        .as_object()
        .ok_or_else(|| "local record update must be an object".to_string())?;
    for (key, value) in changes_object {
        if key != "id" {
            existing_object.insert(key.clone(), value.clone());
        }
    }
    let connection = lock_database(&state)?;
    put_record(&connection, &table, &existing, false)?;
    Ok(1)
}

#[tauri::command]
pub fn local_db_delete(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    id: String,
) -> Result<(), String> {
    validate_table(&table)?;
    lock_database(&state)?
        .execute(
            "DELETE FROM local_records WHERE table_name = ?1 AND id = ?2",
            params![table, id],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_bulk_delete(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    ids: Vec<String>,
) -> Result<(), String> {
    validate_table(&table)?;
    let connection = lock_database(&state)?;
    connection
        .execute_batch("SAVEPOINT narrative_bulk_delete")
        .map_err(|error| error.to_string())?;
    for id in ids {
        if let Err(error) = connection.execute(
            "DELETE FROM local_records WHERE table_name = ?1 AND id = ?2",
            params![table, id],
        ) {
            let _ = connection
                .execute_batch("ROLLBACK TO narrative_bulk_delete; RELEASE narrative_bulk_delete;");
            return Err(error.to_string());
        }
    }
    connection
        .execute_batch("RELEASE narrative_bulk_delete")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_delete_where(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
    field: String,
    value: String,
) -> Result<usize, String> {
    validate_table(&table)?;
    let column = filter_column(&field)?;
    lock_database(&state)?
        .execute(
            &format!("DELETE FROM local_records WHERE table_name = ?1 AND {column} = ?2"),
            params![table, value],
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_clear(state: tauri::State<'_, LocalDatabase>, table: String) -> Result<(), String> {
    validate_table(&table)?;
    lock_database(&state)?
        .execute("DELETE FROM local_records WHERE table_name = ?1", [table])
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_primary_keys(
    state: tauri::State<'_, LocalDatabase>,
    table: String,
) -> Result<Vec<String>, String> {
    validate_table(&table)?;
    let connection = lock_database(&state)?;
    let mut statement = connection
        .prepare("SELECT id FROM local_records WHERE table_name = ?1")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([table], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| row.map_err(|error| error.to_string()))
        .collect()
}

#[tauri::command]
pub fn local_db_begin(state: tauri::State<'_, LocalDatabase>) -> Result<(), String> {
    lock_database(&state)?
        .execute_batch("BEGIN IMMEDIATE")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_commit(state: tauri::State<'_, LocalDatabase>) -> Result<(), String> {
    lock_database(&state)?
        .execute_batch("COMMIT")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_rollback(state: tauri::State<'_, LocalDatabase>) -> Result<(), String> {
    lock_database(&state)?
        .execute_batch("ROLLBACK")
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_metadata_get(
    state: tauri::State<'_, LocalDatabase>,
    key: String,
) -> Result<Option<String>, String> {
    lock_database(&state)?
        .query_row(
            "SELECT value FROM app_metadata WHERE key = ?1",
            [key],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn local_db_metadata_set(
    state: tauri::State<'_, LocalDatabase>,
    key: String,
    value: String,
) -> Result<(), String> {
    lock_database(&state)?
        .execute(
            "INSERT INTO app_metadata(key, value, updated_at_ms)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
               value = excluded.value,
               updated_at_ms = excluded.updated_at_ms",
            params![key, value, now_ms()? as i64],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn parse_backup_name(name: &str, size: u64) -> Option<BackupInfo> {
    let stem = name.strip_suffix(".sqlite3")?;
    let mut parts = stem.split('_');
    if parts.next()? != "narrative-ark" {
        return None;
    }
    let created_at_ms = parts.next()?.parse().ok()?;
    let reason = parts.next()?.to_string();
    if parts.next().is_some() {
        return None;
    }
    Some(BackupInfo {
        id: name.to_string(),
        created_at_ms,
        size,
        reason,
    })
}

fn list_backups(backup_dir: &Path) -> Result<Vec<BackupInfo>, String> {
    let mut backups = fs::read_dir(backup_dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            parse_backup_name(entry.file_name().to_string_lossy().as_ref(), metadata.len())
        })
        .collect::<Vec<_>>();
    backups.sort_by(|left, right| right.created_at_ms.cmp(&left.created_at_ms));
    Ok(backups)
}

fn create_backup_inner(
    connection: &mut Connection,
    backup_dir: &Path,
    reason: &str,
) -> Result<BackupInfo, String> {
    if !matches!(reason, "automatic" | "manual" | "pre-restore") {
        return Err("invalid backup reason".to_string());
    }
    fs::create_dir_all(backup_dir).map_err(|error| error.to_string())?;
    let created_at_ms = now_ms()?;
    let id = format!("narrative-ark_{created_at_ms}_{reason}.sqlite3");
    let path = backup_dir.join(&id);
    let mut destination = Connection::open(&path).map_err(|error| error.to_string())?;
    {
        let backup =
            Backup::new(connection, &mut destination).map_err(|error| error.to_string())?;
        backup
            .run_to_completion(8, Duration::from_millis(25), None)
            .map_err(|error| error.to_string())?;
    }
    let size = fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    connection
        .execute(
            "INSERT OR REPLACE INTO backup_events(id, reason, created_at_ms, size_bytes)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, reason, created_at_ms as i64, size as i64],
        )
        .map_err(|error| error.to_string())?;

    let backups = list_backups(backup_dir)?;
    let keep = if reason == "automatic" { 10 } else { 20 };
    let mut same_reason = backups
        .iter()
        .filter(|backup| backup.reason == reason)
        .skip(keep);
    for expired in &mut same_reason {
        let _ = fs::remove_file(backup_dir.join(&expired.id));
    }
    Ok(BackupInfo {
        id,
        created_at_ms,
        size,
        reason: reason.to_string(),
    })
}

#[tauri::command]
pub fn local_db_create_backup(
    state: tauri::State<'_, LocalDatabase>,
    reason: String,
) -> Result<BackupInfo, String> {
    let mut connection = lock_database(&state)?;
    create_backup_inner(&mut connection, &state.backup_dir, &reason)
}

#[tauri::command]
pub fn local_db_list_backups(
    state: tauri::State<'_, LocalDatabase>,
) -> Result<Vec<BackupInfo>, String> {
    list_backups(&state.backup_dir)
}

fn validated_backup_path(backup_dir: &Path, id: &str) -> Result<PathBuf, String> {
    let mut components = Path::new(id).components();
    let component = components
        .next()
        .ok_or_else(|| "backup id is empty".to_string())?;
    if components.next().is_some() || !matches!(component, Component::Normal(_)) {
        return Err("invalid backup id".to_string());
    }
    if parse_backup_name(id, 0).is_none() {
        return Err("invalid backup file name".to_string());
    }
    Ok(backup_dir.join(id))
}

#[tauri::command]
pub fn local_db_restore_backup(
    state: tauri::State<'_, LocalDatabase>,
    id: String,
) -> Result<(), String> {
    let source_path = validated_backup_path(&state.backup_dir, &id)?;
    if !source_path.is_file() {
        return Err("backup file not found".to_string());
    }
    let mut connection = lock_database(&state)?;
    create_backup_inner(&mut connection, &state.backup_dir, "pre-restore")?;
    let source = Connection::open(source_path).map_err(|error| error.to_string())?;
    {
        let backup = Backup::new(&source, &mut connection).map_err(|error| error.to_string())?;
        backup
            .run_to_completion(8, Duration::from_millis(25), None)
            .map_err(|error| error.to_string())?;
    }
    apply_migrations(&mut connection)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_connection() -> Connection {
        let mut connection = Connection::open_in_memory().expect("open memory sqlite");
        apply_migrations(&mut connection).expect("apply migrations");
        connection
    }

    #[test]
    fn migrations_are_versioned_and_idempotent() {
        let mut connection = test_connection();
        apply_migrations(&mut connection).expect("reapply migrations");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .expect("count migrations");
        assert_eq!(count, MIGRATIONS.len() as i64);
    }

    #[test]
    fn records_preserve_json_and_enforce_add_only() {
        let connection = test_connection();
        let record = serde_json::json!({
            "id": "save-1",
            "projectId": "project-1",
            "turn": 7,
            "updatedAt": "2026-07-28T00:00:00.000Z"
        });
        put_record(&connection, "saves", &record, true).expect("insert record");
        let duplicate =
            put_record(&connection, "saves", &record, true).expect_err("duplicate add must fail");
        assert!(duplicate.starts_with("constraint:"));
        let (payload, parent): (String, String) = connection
            .query_row(
                "SELECT payload, parent_id FROM local_records
                 WHERE table_name = 'saves' AND id = 'save-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("load record");
        assert_eq!(parse_payload(payload).expect("parse payload"), record);
        assert_eq!(parent, "project-1");
    }

    #[test]
    fn backup_is_a_restorable_sqlite_snapshot() {
        let mut connection = test_connection();
        put_record(
            &connection,
            "projects",
            &serde_json::json!({"id": "project-before", "updatedAt": "2026-07-28"}),
            false,
        )
        .expect("insert pre-backup record");

        let directory = std::env::temp_dir().join(format!(
            "narrative-ark-local-data-{}-{}",
            std::process::id(),
            now_ms().expect("timestamp")
        ));
        fs::create_dir_all(&directory).expect("create backup test directory");
        let info =
            create_backup_inner(&mut connection, &directory, "manual").expect("create backup");
        assert!(directory.join(&info.id).is_file());

        connection
            .execute(
                "DELETE FROM local_records WHERE table_name = 'projects'",
                [],
            )
            .expect("mutate database");
        let source = Connection::open(directory.join(&info.id)).expect("open snapshot for restore");
        {
            let backup = Backup::new(&source, &mut connection).expect("prepare restore");
            backup
                .run_to_completion(8, Duration::from_millis(1), None)
                .expect("restore snapshot");
        }
        let restored: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_records
                 WHERE table_name = 'projects' AND id = 'project-before'",
                [],
                |row| row.get(0),
            )
            .expect("count restored record");
        assert_eq!(restored, 1);
        drop(source);
        fs::remove_dir_all(directory).expect("remove backup test directory");
    }
}
