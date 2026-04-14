import { apiGet, apiPatch } from "@/services/api";
import { CareMode, GuardianOptions } from "@/types/care";

type ModeApiResponse = {
  mode: CareMode;
  options: {
    check_in_interval_minutes: number;
    alert_repeat_count: number;
    always_on_location_enabled: boolean;
  };
};

type ModeUpdateRequest = {
  mode: CareMode;
  options: {
    check_in_interval_minutes: number;
    alert_repeat_count: number;
    always_on_location_enabled: boolean;
  };
};

export type CareModeState = {
  mode: CareMode;
  options: GuardianOptions;
};

export async function getCurrentMode(): Promise<CareModeState> {
  const response = await apiGet<ModeApiResponse>("/modes/current");
  return fromApiResponse(response);
}

export async function updateCurrentMode(payload: CareModeState): Promise<CareModeState> {
  const response = await apiPatch<ModeApiResponse>("/modes/current", toApiRequest(payload));
  return fromApiResponse(response);
}

function fromApiResponse(response: ModeApiResponse): CareModeState {
  return {
    mode: response.mode,
    options: {
      checkInIntervalMinutes: response.options.check_in_interval_minutes,
      alertRepeatCount: response.options.alert_repeat_count,
      alwaysOnLocationEnabled: response.options.always_on_location_enabled,
    },
  };
}

function toApiRequest(payload: CareModeState): ModeUpdateRequest {
  return {
    mode: payload.mode,
    options: {
      check_in_interval_minutes: payload.options.checkInIntervalMinutes,
      alert_repeat_count: payload.options.alertRepeatCount,
      always_on_location_enabled: payload.options.alwaysOnLocationEnabled,
    },
  };
}
