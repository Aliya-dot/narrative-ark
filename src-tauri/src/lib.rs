mod local_data;

use tauri::Manager;
use tauri_plugin_keyring_store::KeyringExt;

async fn run_secret_operation<T, F>(operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|error| format!("secure storage worker failed: {error}"))?
}

#[tauri::command]
async fn secure_secret_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let store = app.keyring().store.clone();
    run_secret_operation(move || store.get_password(&key).map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn secure_secret_set(
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    let store = app.keyring().store.clone();
    run_secret_operation(move || {
        store
            .set_password(&key, &value)
            .map_err(|error| error.to_string())
    })
    .await
}

#[tauri::command]
async fn secure_secret_remove(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let store = app.keyring().store.clone();
    run_secret_operation(move || store.delete(&key).map_err(|error| error.to_string())).await
}

#[tauri::command]
async fn secure_secret_has(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    let store = app.keyring().store.clone();
    run_secret_operation(move || {
        store
            .exists_nonempty(&key)
            .map_err(|error| error.to_string())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_keyring_store::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(target_os = "windows")]
    let builder = builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let database =
                local_data::LocalDatabase::open(app.handle()).map_err(std::io::Error::other)?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            secure_secret_get,
            secure_secret_set,
            secure_secret_remove,
            secure_secret_has,
            local_data::local_db_initialize,
            local_data::local_db_get,
            local_data::local_db_query,
            local_data::local_db_put,
            local_data::local_db_bulk_put,
            local_data::local_db_update,
            local_data::local_db_delete,
            local_data::local_db_bulk_delete,
            local_data::local_db_delete_where,
            local_data::local_db_clear,
            local_data::local_db_primary_keys,
            local_data::local_db_begin,
            local_data::local_db_commit,
            local_data::local_db_rollback,
            local_data::local_db_metadata_get,
            local_data::local_db_metadata_set,
            local_data::local_db_create_backup,
            local_data::local_db_list_backups,
            local_data::local_db_restore_backup,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Narrative Ark");
}
