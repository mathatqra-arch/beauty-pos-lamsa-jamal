// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_sql::{Migration, MigrationKind};

fn main() {
    // ============================================================
    // SQLite schema migrations — versioned & ordered.
    //
    // Each migration runs exactly once. tauri-plugin-sql tracks
    // the highest applied version per database file.
    //
    // Migration 001 — initial schema (tables, indexes).
    //                 Includes: active, description, notes columns
    //                 in their respective CREATE TABLE statements.
    // Migration 002 — sync columns (deleted_at, client_txn_id,
    //                 updated_at, device_id), sync_metadata &
    //                 sale_payments tables, sync indexes.
    // Migration 003 — FAILED: "duplicate column name: active"
    //                 because suppliers.active already exists in 001.
    //                 SKIPPED by tauri-plugin-sql (version 3 is
    //                 marked as failed, not retried).
    // Migration 004 — Safe idempotent fixes: sync_queue dedup,
    //                 unique index, performance indexes, PRAGMA.
    //                 NO ALTER TABLE — all columns already exist
    //                 from Migration 001 or 002.
    // ============================================================
    let migrations = vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("../../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add sync columns (deleted_at, client_txn_id, updated_at, device_id), sync_metadata & sale_payments tables, sync indexes",
            sql: include_str!("../../migrations/002_add_sync_columns.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 003 is intentionally omitted — it failed on
        // existing databases. Migration 004 replaces it safely.
        Migration {
            version: 4,
            description: "safe idempotent schema fixes: sync_queue dedup, unique index, performance indexes, PRAGMA foreign_keys",
            sql: include_str!("../../migrations/004_safe_schema_fixes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "fix boolean columns stored as strings (active, track_stock, allow_negative_stock) — convert to integers",
            sql: include_str!("../../migrations/005_fix_boolean_strings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "schema parity with Supabase/Prisma: add stock_levels, registers tables; add warehouse_id to stock_movements; add register_id to cash_sessions; add barcodes/store_id to products; add balance to suppliers",
            sql: include_str!("../../migrations/006_schema_parity.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:pos.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
