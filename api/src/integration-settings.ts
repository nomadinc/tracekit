export type IntegrationSettingsDefaults = {
  intervalMinutes: number;
  lookbackHours: number;
};

export function buildIntegrationSettingsDefaultRow(
  platform: string,
  defaults: IntegrationSettingsDefaults,
  now = new Date().toISOString(),
) {
  return {
    platform,
    auto_import_enabled: false,
    auto_import_interval_minutes: defaults.intervalMinutes,
    auto_import_lookback_hours: defaults.lookbackHours,
    last_run_at: null,
    last_success_at: null,
    last_error: null,
    updated_at: now,
  };
}

export function buildIntegrationSettingsSavePatch(
  platform: string,
  body: any,
  defaults: IntegrationSettingsDefaults,
  now = new Date().toISOString(),
) {
  return {
    platform,
    auto_import_enabled: Boolean(body.auto_import_enabled),
    auto_import_interval_minutes: Math.max(15, Math.min(1440, Number(body.auto_import_interval_minutes ?? defaults.intervalMinutes) || defaults.intervalMinutes)),
    auto_import_lookback_hours: Math.max(1, Math.min(168, Number(body.auto_import_lookback_hours ?? defaults.lookbackHours) || defaults.lookbackHours)),
    updated_at: now,
  };
}
